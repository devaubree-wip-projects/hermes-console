import { watch, type FSWatcher } from "node:fs";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export type SessionSnapshot = {
  id: string;
  version: string;
};

export type SessionInvalidation = {
  profile: string;
  sessionId: string;
  cursor: number;
  reason: "subscribed" | "changed" | "reconcile";
};

type InvalidationListener = (event: SessionInvalidation) => void;
type WatchHandle = { close(): void };
type WatchDirectory = (
  directory: string,
  onChange: (filename: string | null) => void,
) => WatchHandle;
type ReadStateFingerprint = (directory: string) => Promise<string>;

type ProfileObserver = {
  profile: string;
  subscribers: Map<string, Set<InvalidationListener>>;
  snapshots: Map<string, string>;
  initialized: boolean;
  watcher: WatchHandle | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  reconcileTimer: ReturnType<typeof setInterval> | null;
  refreshing: boolean;
  refreshRequested: boolean;
  fsCheckRequested: boolean;
  stateFingerprint: string | null;
  ready: Promise<void>;
  cursor: number;
};

export type SessionChangeHubOptions = {
  loadSessions: (profile: string) => Promise<SessionSnapshot[]>;
  hermesHome?: string;
  debounceMs?: number;
  reconcileMs?: number;
  watchDirectory?: WatchDirectory;
  readStateFingerprint?: ReadStateFingerprint;
};

const PROFILE_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const STATE_FILES = new Set(["state.db", "state.db-wal"]);

function defaultWatchDirectory(
  directory: string,
  onChange: (filename: string | null) => void,
): FSWatcher {
  return watch(directory, { persistent: false }, (_event, filename) => {
    onChange(filename === null ? null : String(filename));
  });
}

async function defaultReadStateFingerprint(directory: string) {
  const fingerprints = await Promise.all([...STATE_FILES].map(async (filename) => {
    try {
      const info = await stat(path.join(directory, filename), { bigint: true });
      return `${filename}:${info.mtimeNs}:${info.size}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return `${filename}:missing`;
      throw error;
    }
  }));
  return fingerprints.join("|");
}

/**
 * One filesystem observer per active Hermes profile.
 *
 * Filesystem events are only invalidation hints. The canonical session state
 * remains the Hermes REST API, whose compact list rows let us target the
 * affected session before notifying browser subscribers.
 */
export class SessionChangeHub {
  private readonly observers = new Map<string, ProfileObserver>();
  private readonly loadSessions: SessionChangeHubOptions["loadSessions"];
  private readonly hermesHome: string;
  private readonly debounceMs: number;
  private readonly reconcileMs: number;
  private readonly watchDirectory: WatchDirectory;
  private readonly readStateFingerprint: ReadStateFingerprint;

  constructor(options: SessionChangeHubOptions) {
    this.loadSessions = options.loadSessions;
    this.hermesHome = options.hermesHome?.trim() || path.join(homedir(), ".hermes");
    this.debounceMs = options.debounceMs ?? 200;
    this.reconcileMs = options.reconcileMs ?? 0;
    this.watchDirectory = options.watchDirectory ?? defaultWatchDirectory;
    this.readStateFingerprint = options.readStateFingerprint ?? defaultReadStateFingerprint;
  }

  subscribe(profile: string, sessionId: string, listener: InvalidationListener) {
    if (!this.validProfile(profile)) throw new Error("invalid Hermes profile");
    if (!sessionId || sessionId.length > 256) throw new Error("invalid Hermes session id");

    const observer = this.observers.get(profile) ?? this.createObserver(profile);
    const listeners = observer.subscribers.get(sessionId) ?? new Set<InvalidationListener>();
    listeners.add(listener);
    observer.subscribers.set(sessionId, listeners);

    // The acknowledgement doubles as reconnect catch-up. Wait for the first
    // Hermes snapshot so a restarting runtime is ready before the browser
    // attempts its canonical history GET.
    if (observer.initialized) {
      this.notify(observer, sessionId, "subscribed", listener);
    } else {
      void observer.ready.then(() => {
        if (
          this.observers.get(profile) === observer
          && observer.subscribers.get(sessionId)?.has(listener)
        ) {
          this.notify(observer, sessionId, "subscribed", listener);
        }
      });
    }

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) observer.subscribers.delete(sessionId);
      if (observer.subscribers.size === 0) this.destroyObserver(profile, observer);
    };
  }

  close() {
    for (const [profile, observer] of this.observers) {
      this.destroyObserver(profile, observer);
    }
  }

  private validProfile(profile: string) {
    return profile === "default" || PROFILE_RE.test(profile);
  }

  private profileHome(profile: string) {
    return profile === "default"
      ? this.hermesHome
      : path.join(this.hermesHome, "profiles", profile);
  }

  private createObserver(profile: string) {
    const observer: ProfileObserver = {
      profile,
      subscribers: new Map(),
      snapshots: new Map(),
      initialized: false,
      watcher: null,
      debounceTimer: null,
      reconcileTimer: null,
      refreshing: false,
      refreshRequested: false,
      fsCheckRequested: false,
      stateFingerprint: null,
      ready: Promise.resolve(),
      cursor: 0,
    };
    this.observers.set(profile, observer);

    try {
      observer.watcher = this.watchDirectory(this.profileHome(profile), (filename) => {
        if (filename !== null && !STATE_FILES.has(path.basename(filename))) return;
        this.scheduleFilesystemCheck(observer);
      });
    } catch (error) {
      console.warn(
        `[session-change] watcher unavailable for profile ${profile}; using reconciliation only`,
        error,
      );
    }

    if (this.reconcileMs > 0) {
      observer.reconcileTimer = setInterval(() => {
        void this.refresh(observer, true);
      }, this.reconcileMs);
      observer.reconcileTimer.unref?.();
    }

    observer.ready = this.refresh(observer, false);
    return observer;
  }

  private destroyObserver(profile: string, observer: ProfileObserver) {
    if (this.observers.get(profile) !== observer) return;
    this.observers.delete(profile);
    observer.watcher?.close();
    if (observer.debounceTimer) clearTimeout(observer.debounceTimer);
    if (observer.reconcileTimer) clearInterval(observer.reconcileTimer);
  }

  private scheduleFilesystemCheck(observer: ProfileObserver) {
    if (observer.debounceTimer) clearTimeout(observer.debounceTimer);
    observer.debounceTimer = setTimeout(() => {
      observer.debounceTimer = null;
      void this.checkFilesystemChange(observer);
    }, this.debounceMs);
  }

  private async checkFilesystemChange(observer: ProfileObserver) {
    if (this.observers.get(observer.profile) !== observer) return;
    if (observer.refreshing) {
      observer.fsCheckRequested = true;
      return;
    }
    try {
      const fingerprint = await this.readStateFingerprint(this.profileHome(observer.profile));
      if (fingerprint === observer.stateFingerprint) return;
      observer.stateFingerprint = fingerprint;
      await this.refresh(observer, false);
    } catch (error) {
      console.warn(`[session-change] state check failed for profile ${observer.profile}`, error);
    }
  }

  private async refresh(observer: ProfileObserver, reconcile: boolean) {
    if (this.observers.get(observer.profile) !== observer) return;
    if (observer.refreshing) {
      observer.refreshRequested = true;
      return;
    }
    observer.refreshing = true;

    try {
      do {
        observer.refreshRequested = false;
        try {
          const rows = await this.loadSessions(observer.profile);
          if (this.observers.get(observer.profile) !== observer) return;
          const current = new Map(rows.map((row) => [row.id, row.version]));

          if (observer.initialized) {
            const changed = new Set<string>();
            for (const [id, version] of current) {
              if (observer.snapshots.get(id) !== version) changed.add(id);
            }
            for (const id of observer.snapshots.keys()) {
              if (!current.has(id)) changed.add(id);
            }

            if (changed.size > 0) {
              for (const id of changed) this.notify(observer, id, "changed");
            }
          }

          observer.snapshots = current;
          observer.initialized = true;
        } catch (error) {
          console.warn(`[session-change] refresh failed for profile ${observer.profile}`, error);
          this.notifyAll(observer, reconcile ? "reconcile" : "changed");
        }
        await this.captureStateFingerprint(observer);
      } while (observer.refreshRequested);
    } finally {
      observer.refreshing = false;
      if (observer.fsCheckRequested) {
        observer.fsCheckRequested = false;
        this.scheduleFilesystemCheck(observer);
      }
    }
  }

  private async captureStateFingerprint(observer: ProfileObserver) {
    try {
      observer.stateFingerprint = await this.readStateFingerprint(
        this.profileHome(observer.profile),
      );
    } catch (error) {
      console.warn(`[session-change] state capture failed for profile ${observer.profile}`, error);
    }
  }

  private notifyAll(observer: ProfileObserver, reason: SessionInvalidation["reason"]) {
    for (const sessionId of observer.subscribers.keys()) {
      this.notify(observer, sessionId, reason);
    }
  }

  private notify(
    observer: ProfileObserver,
    sessionId: string,
    reason: SessionInvalidation["reason"],
    only?: InvalidationListener,
  ) {
    const listeners = only ? [only] : [...(observer.subscribers.get(sessionId) ?? [])];
    if (listeners.length === 0) return;
    const event = {
      profile: observer.profile,
      sessionId,
      cursor: ++observer.cursor,
      reason,
    } satisfies SessionInvalidation;
    for (const listener of listeners) listener(event);
  }
}
