import "server-only";

import postgres from "postgres";

const CHANNEL = "hermes_work_changed";

export type WorkChange = { workspaceId?: string; workItemId?: string; source?: string };

export type WorkChangeFilter = { workspaceId: string; workItemId?: string };

export type WorkChangeSubscription = { ready: Promise<void>; unsubscribe: () => void };

/** Opens the shared LISTEN connection and returns how to close it. */
export type WorkChangeConnector = (onNotification: (payload: string) => void) => Promise<() => Promise<void>>;

const openListenConnection: WorkChangeConnector = async (onNotification) => {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const listener = await client.listen(CHANNEL, onNotification);
  return async () => {
    await listener.unlisten().catch(() => undefined);
    await client.end({ timeout: 1 }).catch(() => undefined);
  };
};

type Subscriber = WorkChangeFilter & { deliver: (change: WorkChange) => void };

/**
 * Fans out `hermes_work_changed` notifications to every SSE subscriber of the
 * process over a single Postgres connection: one LISTEN per process instead of
 * one per open stream, which used to exhaust `max_connections` well before the
 * application pool was even saturated.
 */
export class WorkChangeBroadcaster {
  private readonly subscribers = new Set<Subscriber>();
  private connection: Promise<() => Promise<void>> | null = null;

  constructor(private readonly connect: WorkChangeConnector = openListenConnection) {}

  subscribe(filter: WorkChangeFilter, deliver: (change: WorkChange) => void): WorkChangeSubscription {
    const subscriber: Subscriber = { ...filter, deliver };
    this.subscribers.add(subscriber);
    const connection = this.connection ?? this.open();
    return {
      ready: connection.then(() => undefined),
      unsubscribe: () => {
        if (!this.subscribers.delete(subscriber)) return;
        if (this.subscribers.size === 0) this.close();
      },
    };
  }

  private open() {
    const connection = this.connect((payload) => this.dispatch(payload)).catch((error) => {
      if (this.connection === connection) this.connection = null;
      throw error;
    });
    this.connection = connection;
    return connection;
  }

  private close() {
    const connection = this.connection;
    this.connection = null;
    void connection?.then((disconnect) => disconnect()).catch(() => undefined);
  }

  private dispatch(payload: string) {
    let change: WorkChange;
    try {
      change = JSON.parse(payload) as WorkChange;
    } catch {
      return; /* malformed notifications are ignored */
    }
    for (const subscriber of this.subscribers) {
      if (subscriber.workspaceId !== change.workspaceId) continue;
      if (subscriber.workItemId && subscriber.workItemId !== change.workItemId) continue;
      subscriber.deliver(change);
    }
  }
}

// Reuse the broadcaster across Next.js dev HMR reloads to avoid duplicate LISTEN connections.
const globalStore = globalThis as typeof globalThis & { workChangeBroadcaster?: WorkChangeBroadcaster };
export const workChangeBroadcaster = globalStore.workChangeBroadcaster ?? new WorkChangeBroadcaster();
if (process.env.NODE_ENV !== "production") globalStore.workChangeBroadcaster = workChangeBroadcaster;
