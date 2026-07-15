import { describe, expect, test } from "bun:test";

import { RequestCoalescer } from "./request-coalescer";

describe("RequestCoalescer", () => {
  test("shares one in-flight request for the same key", async () => {
    const coalescer = new RequestCoalescer<string, string>();
    let calls = 0;
    let resolve!: (value: string) => void;
    const request = () => {
      calls += 1;
      return new Promise<string>((done) => {
        resolve = done;
      });
    };

    const first = coalescer.run("sessions", request);
    const second = coalescer.run("sessions", request);

    expect(first).toBe(second);
    expect(calls).toBe(1);
    resolve("ok");
    await expect(first).resolves.toBe("ok");
    await expect(second).resolves.toBe("ok");
  });

  test("allows a fresh request after settlement", async () => {
    const coalescer = new RequestCoalescer<string, number>();
    let calls = 0;
    const request = async () => ++calls;

    await expect(coalescer.run("history", request)).resolves.toBe(1);
    await expect(coalescer.run("history", request)).resolves.toBe(2);
    expect(calls).toBe(2);
  });

  test("clears a rejected request", async () => {
    const coalescer = new RequestCoalescer<string, string>();
    let calls = 0;
    const request = async () => {
      calls += 1;
      if (calls === 1) throw new Error("offline");
      return "recovered";
    };

    await expect(coalescer.run("session", request)).rejects.toThrow("offline");
    await expect(coalescer.run("session", request)).resolves.toBe("recovered");
  });
});
