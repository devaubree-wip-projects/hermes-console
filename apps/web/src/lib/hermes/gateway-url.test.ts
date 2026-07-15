import { afterEach, describe, expect, test } from "bun:test";
import { validateGatewayUrl } from "./gateway-url";

const previousAllowedHosts = process.env.HERMES_GATEWAY_ALLOWED_HOSTS;

afterEach(() => {
  if (previousAllowedHosts === undefined) delete process.env.HERMES_GATEWAY_ALLOWED_HOSTS;
  else process.env.HERMES_GATEWAY_ALLOWED_HOSTS = previousAllowedHosts;
});

describe("Hermes gateway URL policy", () => {
  test("accepts loopback during local development", () => {
    expect(validateGatewayUrl("http://127.0.0.1:8787/")).toBe("http://127.0.0.1:8787");
  });

  test("accepts only explicitly configured remote hosts", () => {
    process.env.HERMES_GATEWAY_ALLOWED_HOSTS = "edge.example.com";
    expect(validateGatewayUrl("https://edge.example.com")).toBe("https://edge.example.com");
    expect(() => validateGatewayUrl("https://metadata.example.net")).toThrow("HERMES_GATEWAY_ALLOWED_HOSTS");
  });

  test("rejects credentials, query strings and non-HTTP protocols", () => {
    expect(() => validateGatewayUrl("http://user:secret@127.0.0.1:8787")).toThrow();
    expect(() => validateGatewayUrl("http://127.0.0.1:8787?target=metadata")).toThrow();
    expect(() => validateGatewayUrl("file:///etc/passwd")).toThrow();
  });
});
