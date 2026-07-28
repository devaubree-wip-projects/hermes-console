import { describe, expect, mock, test } from "bun:test";
import type { WorkChangeConnector } from "@/lib/work/work-change-broadcaster";

mock.module("server-only", () => ({}));
const { WorkChangeBroadcaster } = await import("@/lib/work/work-change-broadcaster");

function fakeConnection() {
  const state: { connects: number; disconnects: number; notify: (payload: string) => void } = {
    connects: 0,
    disconnects: 0,
    notify: () => {},
  };
  const connect: WorkChangeConnector = async (onNotification) => {
    state.connects += 1;
    state.notify = onNotification;
    return async () => { state.disconnects += 1; };
  };
  return { state, connect };
}

describe("WorkChangeBroadcaster", () => {
  test("opens a single listen connection for every subscriber", async () => {
    const { state, connect } = fakeConnection();
    const broadcaster = new WorkChangeBroadcaster(connect);

    const subscriptions = Array.from({ length: 6 }, () =>
      broadcaster.subscribe({ workspaceId: "workspace-1" }, () => {}));
    await Promise.all(subscriptions.map((subscription) => subscription.ready));

    expect(state.connects).toBe(1);
  });

  test("routes a notification to the concerned subscribers only", async () => {
    const { state, connect } = fakeConnection();
    const broadcaster = new WorkChangeBroadcaster(connect);
    const received: string[] = [];
    const subscribe = (name: string, workspaceId: string, workItemId?: string) =>
      broadcaster.subscribe({ workspaceId, workItemId }, () => received.push(name));

    const subscriptions = [
      subscribe("workspace-board", "workspace-1"),
      subscribe("other-workspace", "workspace-2"),
      subscribe("matching-item", "workspace-1", "item-1"),
      subscribe("other-item", "workspace-1", "item-2"),
    ];
    await Promise.all(subscriptions.map((subscription) => subscription.ready));
    state.notify(JSON.stringify({ workspaceId: "workspace-1", workItemId: "item-1", source: "work_runs" }));

    expect(received.sort()).toEqual(["matching-item", "workspace-board"]);
  });

  test("ignores malformed notifications", async () => {
    const { state, connect } = fakeConnection();
    const broadcaster = new WorkChangeBroadcaster(connect);
    let deliveries = 0;

    await broadcaster.subscribe({ workspaceId: "workspace-1" }, () => { deliveries += 1; }).ready;
    state.notify("not json");

    expect(deliveries).toBe(0);
  });

  test("keeps the shared connection until the last subscriber leaves", async () => {
    const { state, connect } = fakeConnection();
    const broadcaster = new WorkChangeBroadcaster(connect);
    const received: string[] = [];

    const first = broadcaster.subscribe({ workspaceId: "workspace-1" }, () => received.push("first"));
    const second = broadcaster.subscribe({ workspaceId: "workspace-1" }, () => received.push("second"));
    await Promise.all([first.ready, second.ready]);

    first.unsubscribe();
    first.unsubscribe();
    state.notify(JSON.stringify({ workspaceId: "workspace-1", source: "work_items" }));
    expect(received).toEqual(["second"]);
    expect(state.disconnects).toBe(0);

    second.unsubscribe();
    await Promise.resolve();
    expect(state.disconnects).toBe(1);
  });

  test("reconnects after a failed connection attempt", async () => {
    let connects = 0;
    const broadcaster = new WorkChangeBroadcaster(async () => {
      connects += 1;
      if (connects === 1) throw new Error("connexion refusée");
      return async () => {};
    });

    await expect(broadcaster.subscribe({ workspaceId: "workspace-1" }, () => {}).ready).rejects.toThrow("connexion refusée");
    await broadcaster.subscribe({ workspaceId: "workspace-1" }, () => {}).ready;

    expect(connects).toBe(2);
  });
});
