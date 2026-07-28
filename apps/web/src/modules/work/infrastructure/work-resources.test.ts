import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

describe("runtime Work resource descriptors", () => {
  test("requires Owner role for host filesystem grants", async () => {
    const { minimumRoleForWorkResource } = await import("./work-service");
    expect(
      minimumRoleForWorkResource("file", "grant://client-code/src/index.ts"),
    ).toBe("owner");
    expect(
      minimumRoleForWorkResource("file", "work://resources/input.txt"),
    ).toBe("member");
    expect(
      minimumRoleForWorkResource("link", "https://example.test/reference"),
    ).toBe("member");
  });

  test("shapes Console files and grants without exposing source paths", async () => {
    const { runtimeWorkResourceDescriptor } = await import(
      "./work-runtime-service"
    );
    expect(
      runtimeWorkResourceDescriptor({
        id: "11111111-2222-4333-8444-555555555555",
        kind: "file",
        name: "Brief",
        uri: "work://resources/brief/input.txt",
        metadata: { fileId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
      }),
    ).toEqual({
      resourceId: "11111111-2222-4333-8444-555555555555",
      name: "Brief",
      source: "console",
      targetPath: "brief/input.txt",
    });
    expect(
      runtimeWorkResourceDescriptor({
        id: "11111111-2222-4333-8444-555555555555",
        kind: "file",
        name: "Code",
        uri: "grant://client-code/src/index.ts",
        metadata: {},
      }),
    ).toEqual({
      resourceId: "11111111-2222-4333-8444-555555555555",
      name: "Code",
      source: "grant",
      targetPath: "grants/client-code/src/index.ts",
      grantAlias: "client-code",
      grantPath: "src/index.ts",
    });
  });

  test("rejects traversal and malformed URI encoding", async () => {
    const { runtimeWorkResourceDescriptor } = await import(
      "./work-runtime-service"
    );
    for (const uri of [
      "work://resources/../secret",
      "grant://code/../secret",
      "grant://code/%2e%2e/secret",
      "grant://code/%E0%A4%A",
      "grant://bad.alias/file.txt",
    ]) {
      expect(
        runtimeWorkResourceDescriptor({
          id: "11111111-2222-4333-8444-555555555555",
          kind: "file",
          name: "Unsafe",
          uri,
          metadata: { fileId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
        }),
      ).toBeNull();
    }
  });

  test("omits resources without a workspace file identity", async () => {
    const { runtimeWorkResourceDescriptor } = await import(
      "./work-runtime-service"
    );
    expect(
      runtimeWorkResourceDescriptor({
        id: "11111111-2222-4333-8444-555555555555",
        kind: "file",
        name: "Missing source",
        uri: "work://resources/input.txt",
        metadata: {},
      }),
    ).toBeNull();
  });
});
