import { afterEach, describe, expect, test } from "bun:test";
import { HermesClient } from "./client";

async function eventually(assertion: () => void, timeoutMs = 1_000) {
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

const originalFetch = globalThis.fetch;
const OriginalWebSocket = globalThis.WebSocket;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly sent: string[] = [];
  readyState = FakeWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(readonly url: string | URL) {
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  send(frame: string) {
    this.sent.push(frame);
  }

  receive(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }

  close(code = 1000, reason = "") {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason } as CloseEvent);
  }
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.WebSocket = OriginalWebSocket;
  FakeWebSocket.instances = [];
});

describe("HermesClient persisted-session subscriptions", () => {
  test("subscribes, dispatches invalidations, and resubscribes after reconnect", async () => {
    globalThis.fetch = (async () => Response.json({ ticket: "signed-ticket" })) as unknown as typeof fetch;
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const client = new HermesClient("/runtime-ticket");
    const invalidations: string[] = [];
    client.onSessionInvalidated("session-a", (event) => invalidations.push(event.reason));
    client.connect();

    await eventually(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const first = FakeWebSocket.instances[0]!;
    first.open();
    expect(first.sent.map((frame) => JSON.parse(frame))).toContainEqual({
      __bridge__: "session.subscribe",
      sessionId: "session-a",
    });

    first.receive({
      __bridge__: "session.invalidated",
      sessionId: "session-a",
      cursor: 1,
      reason: "changed",
    });
    expect(invalidations).toEqual(["changed"]);

    first.close(1011, "restart");
    await eventually(() => expect(FakeWebSocket.instances).toHaveLength(2));
    const second = FakeWebSocket.instances[1]!;
    second.open();
    expect(second.sent.map((frame) => JSON.parse(frame))).toContainEqual({
      __bridge__: "session.subscribe",
      sessionId: "session-a",
    });

    client.disconnect();
  });

  test("unsubscribes only after the final listener is removed", async () => {
    globalThis.fetch = (async () => Response.json({ ticket: "signed-ticket" })) as unknown as typeof fetch;
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const client = new HermesClient("/runtime-ticket");
    client.connect();
    await eventually(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0]!;
    socket.open();

    const offA = client.onSessionInvalidated("session-a", () => {});
    const offB = client.onSessionInvalidated("session-a", () => {});
    offA();
    expect(socket.sent.map((frame) => JSON.parse(frame))).not.toContainEqual({
      __bridge__: "session.unsubscribe",
      sessionId: "session-a",
    });
    offB();
    expect(socket.sent.map((frame) => JSON.parse(frame))).toContainEqual({
      __bridge__: "session.unsubscribe",
      sessionId: "session-a",
    });
    client.disconnect();
  });
});
