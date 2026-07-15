import { afterEach, describe, expect, test } from "bun:test";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  SessionChangeHub,
  type SessionInvalidation,
  type SessionSnapshot,
} from "./session-change-hub";

async function eventually(assertion: () => void, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await Bun.sleep(5);
    }
  }
  throw lastError;
}

const hubs: SessionChangeHub[] = [];

afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
});

describe("SessionChangeHub", () => {
  test("targets only the session whose Hermes list fingerprint changed", async () => {
    let snapshots: SessionSnapshot[] = [
      { id: "session-a", version: "1" },
      { id: "session-b", version: "1" },
    ];
    let loads = 0;
    let stateFingerprint = "state-1";
    const watcher = { onChange: null as ((filename: string | null) => void) | null };
    let watcherClosed = false;
    const hub = new SessionChangeHub({
      hermesHome: "/tmp/hermes-test",
      debounceMs: 1,
      reconcileMs: 0,
      loadSessions: async () => {
        loads += 1;
        return snapshots;
      },
      readStateFingerprint: async () => stateFingerprint,
      watchDirectory: (_directory, listener) => {
        watcher.onChange = listener;
        return { close: () => { watcherClosed = true; } };
      },
    });
    hubs.push(hub);

    const a: SessionInvalidation[] = [];
    const b: SessionInvalidation[] = [];
    const unsubscribeA = hub.subscribe("profile-one", "session-a", (event) => a.push(event));
    const unsubscribeB = hub.subscribe("profile-one", "session-b", (event) => b.push(event));
    await eventually(() => expect(loads).toBe(1));
    await eventually(() => expect(a.map((event) => event.reason)).toEqual(["subscribed"]));
    await eventually(() => expect(b.map((event) => event.reason)).toEqual(["subscribed"]));

    snapshots = [
      { id: "session-a", version: "2" },
      { id: "session-b", version: "1" },
    ];
    stateFingerprint = "state-2";
    watcher.onChange?.("state.db-wal");

    await eventually(() => expect(a.some((event) => event.reason === "changed")).toBe(true));
    expect(b.filter((event) => event.reason === "changed")).toHaveLength(0);

    unsubscribeA();
    expect(watcherClosed).toBe(false);
    unsubscribeB();
    expect(watcherClosed).toBe(true);
  });

  test("absorbs SQLite events caused by its own Hermes snapshot read", async () => {
    const snapshots = [{ id: "session-a", version: "1" }];
    let loads = 0;
    let stateFingerprint = "baseline";
    const watcher = { onChange: null as ((filename: string | null) => void) | null };
    const hub = new SessionChangeHub({
      debounceMs: 1,
      reconcileMs: 0,
      loadSessions: async () => {
        loads += 1;
        if (loads === 2) stateFingerprint = "post-read";
        return snapshots;
      },
      readStateFingerprint: async () => stateFingerprint,
      watchDirectory: (_directory, listener) => {
        watcher.onChange = listener;
        return { close() {} };
      },
    });
    hubs.push(hub);
    const events: SessionInvalidation[] = [];
    hub.subscribe("default", "session-a", (event) => events.push(event));
    await eventually(() => expect(loads).toBe(1));

    stateFingerprint = "external-write";
    watcher.onChange?.("state.db");
    await eventually(() => expect(loads).toBe(2));
    expect(events.map((event) => event.reason)).toEqual(["subscribed"]);

    // The snapshot read changed SQLite's own file fingerprint. The resulting
    // watcher event must not recursively trigger another Hermes read.
    watcher.onChange?.("state.db");
    await Bun.sleep(10);
    expect(loads).toBe(2);
  });

  test("ignores unrelated profile files and rejects unsafe profiles", async () => {
    let loads = 0;
    const stateFingerprint = "state-1";
    const watcher = { onChange: null as ((filename: string | null) => void) | null };
    const hub = new SessionChangeHub({
      debounceMs: 1,
      reconcileMs: 0,
      loadSessions: async () => {
        loads += 1;
        return [];
      },
      readStateFingerprint: async () => stateFingerprint,
      watchDirectory: (_directory, listener) => {
        watcher.onChange = listener;
        return { close() {} };
      },
    });
    hubs.push(hub);
    hub.subscribe("profile-one", "session-a", () => {});
    await eventually(() => expect(loads).toBe(1));

    watcher.onChange?.("config.yaml");
    await Bun.sleep(10);
    expect(loads).toBe(1);
    expect(() => hub.subscribe("../escape", "session-a", () => {})).toThrow(
      "invalid Hermes profile",
    );
  });

  test("observes real state.db-wal filesystem writes", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "hermes-session-change-"));
    let snapshots = [{ id: "session-a", version: "1" }];
    const events: SessionInvalidation[] = [];
    await writeFile(path.join(home, "state.db-wal"), "initial");
    const hub = new SessionChangeHub({
      hermesHome: home,
      debounceMs: 5,
      reconcileMs: 0,
      loadSessions: async () => snapshots,
    });
    hubs.push(hub);

    try {
      hub.subscribe("default", "session-a", (event) => events.push(event));
      await eventually(() => expect(events.some((event) => event.reason === "subscribed")).toBe(true));
      snapshots = [{ id: "session-a", version: "2" }];
      await appendFile(path.join(home, "state.db-wal"), "change");
      await eventually(
        () => expect(events.some((event) => event.reason === "changed")).toBe(true),
        2_000,
      );
    } finally {
      hub.close();
      await rm(home, { recursive: true, force: true });
    }
  });
});
