import { describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

mock.module("server-only", () => ({}));

const databaseTest = process.env.DATABASE_URL ? test : test.skip;
const permissions = {
  read_files: true,
  web_search: true,
  generate_reports: true,
  propose_changes: true,
  edit_files: false,
  send_emails: false,
  open_prs: false,
};

describe("Work resource download authorization", () => {
  databaseTest(
    "binds a file resource to its claimed run and workspace",
    async () => {
      const [{ db }, schema, runtime, work] = await Promise.all([
        import("@/db"),
        import("@/db/schema"),
        import("./work-runtime-service"),
        import("./work-service"),
      ]);
      const suffix = randomUUID().slice(0, 8);
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `resource-${suffix}@hermes.local`,
          passwordHash: "integration-test-only",
          name: "Resource integration",
        })
        .returning();
      const tenantIds: string[] = [];
      try {
        const [tenantA, tenantB] = await db
          .insert(schema.tenants)
          .values([
            {
              name: `Resource A ${suffix}`,
              slug: `resource-a-${suffix}`,
              ownerUserId: user.id,
            },
            {
              name: `Resource B ${suffix}`,
              slug: `resource-b-${suffix}`,
              ownerUserId: user.id,
            },
          ])
          .returning();
        tenantIds.push(tenantA.id, tenantB.id);
        const [workspaceA, workspaceB] = await db
          .insert(schema.workspaces)
          .values([
            {
              tenantId: tenantA.id,
              name: "Resource A",
              slug: "resource-a",
              hermesBaseUrl: "http://127.0.0.1:9119",
              permissions,
            },
            {
              tenantId: tenantB.id,
              name: "Resource B",
              slug: "resource-b",
              hermesBaseUrl: "http://127.0.0.1:9119",
              permissions,
            },
          ])
          .returning();
        const [installation] = await db
          .insert(schema.runtimeInstallations)
          .values({
            tenantId: tenantA.id,
            name: "Resource Edge",
            installationKey: `resource-edge-${suffix}`,
            origin: "local_managed",
            managementLevel: "managed",
            transport: "direct",
            gatewayUrl: "http://127.0.0.1:8787",
            status: "ready",
            createdByUserId: user.id,
          })
          .returning();
        const [agent] = await db
          .insert(schema.agents)
          .values({
            workspaceId: workspaceA.id,
            runtimeInstallationId: installation.id,
            slug: "resource-worker",
            name: "Resource worker",
            hermesProfileName: `resource-${suffix}`,
            runtimeState: "ready",
            createdByUserId: user.id,
          })
          .returning();
        const [itemA, itemB] = await db
          .insert(schema.workItems)
          .values([
            {
              workspaceId: workspaceA.id,
              number: 1,
              key: "RESA-1",
              title: "Use own resource",
              creatorUserId: user.id,
            },
            {
              workspaceId: workspaceB.id,
              number: 1,
              key: "RESB-1",
              title: "Foreign resource",
              creatorUserId: user.id,
            },
          ])
          .returning();
        const [fileA, fileB] = await db
          .insert(schema.files)
          .values([
            {
              workspaceId: workspaceA.id,
              name: "own.txt",
              storedPath: "/tmp/own.txt",
              size: 3,
              mimeType: "text/plain",
            },
            {
              workspaceId: workspaceB.id,
              name: "foreign.txt",
              storedPath: "/tmp/foreign.txt",
              size: 7,
              mimeType: "text/plain",
            },
          ])
          .returning();
        const [resourceA, resourceB] = await db
          .insert(schema.workResources)
          .values([
            {
              workspaceId: workspaceA.id,
              workItemId: itemA.id,
              kind: "file",
              name: "Own",
              uri: "work://resources/own.txt",
              metadata: { fileId: fileA.id },
              createdByUserId: user.id,
            },
            {
              workspaceId: workspaceB.id,
              workItemId: itemB.id,
              kind: "file",
              name: "Foreign",
              uri: "work://resources/foreign.txt",
              metadata: { fileId: fileB.id },
              createdByUserId: user.id,
            },
          ])
          .returning();
        const [run] = await db
          .insert(schema.workRuns)
          .values({
            workItemId: itemA.id,
            workspaceId: workspaceA.id,
            agentId: agent.id,
            runtimeInstallationId: installation.id,
            hermesProfileName: agent.hermesProfileName,
            triggerType: "api",
            originatorUserId: user.id,
            prompt: "Read the attached file.",
            idempotencyKey: `resource:${suffix}`,
          })
          .returning();

        const [claim] = await runtime.claimWorkRuns({
          installationId: installation.id,
          edgeId: "resource-edge",
          capacity: 1,
        });
        expect(claim.runId).toBe(run.id);
        expect(claim.resources).toContainEqual(
          expect.objectContaining({
            resourceId: resourceA.id,
            source: "console",
            targetPath: "own.txt",
          }),
        );
        await expect(
          runtime.resolveWorkFileResourceDownload({
            runId: run.id,
            installationId: installation.id,
            leaseToken: claim.leaseToken,
            resourceId: resourceA.id,
          }),
        ).resolves.toEqual(
          expect.objectContaining({ storedPath: "/tmp/own.txt", size: 3 }),
        );
        await db
          .update(schema.workspaces)
          .set({ permissions: { ...permissions, read_files: false } })
          .where(eq(schema.workspaces.id, workspaceA.id));
        await expect(
          runtime.resolveWorkFileResourceDownload({
            runId: run.id,
            installationId: installation.id,
            leaseToken: claim.leaseToken,
            resourceId: resourceA.id,
          }),
        ).rejects.toThrow("Ressource introuvable");
        await expect(
          runtime.resolveWorkFileResourceDownload({
            runId: run.id,
            installationId: installation.id,
            leaseToken: claim.leaseToken,
            resourceId: resourceB.id,
          }),
        ).rejects.toThrow("Ressource introuvable");
        const context = {
          tenantId: tenantA.id,
          workspaceId: workspaceA.id,
          workspaceSlug: workspaceA.slug,
          userId: user.id,
          role: "owner" as const,
        };
        await expect(
          work.createWorkspaceWorkResource({
            context: { ...context, role: "member" as const },
            workItemId: itemA.id,
            kind: "file",
            name: "Grant interdit",
            uri: "grant://client-code/private.txt",
          }),
        ).rejects.toThrow("Seul un Owner");
        for (let index = 1; index < work.MAX_WORK_RESOURCES_PER_SCOPE; index += 1) {
          await work.createWorkspaceWorkResource({
            context,
            workItemId: itemA.id,
            kind: "link",
            name: `Reference ${index}`,
            uri: `https://example.test/reference-${index}`,
          });
        }
        await expect(
          work.createWorkspaceWorkResource({
            context,
            workItemId: itemA.id,
            kind: "link",
            name: "Reference excessive",
            uri: "https://example.test/reference-excessive",
          }),
        ).rejects.toThrow("au maximum");
        await db
          .update(schema.workspaces)
          .set({ permissions: { ...permissions, read_files: false } })
          .where(eq(schema.workspaces.id, workspaceA.id));
        await expect(
          runtime.resolveWorkFileResourceDownload({
            runId: run.id,
            installationId: installation.id,
            leaseToken: claim.leaseToken,
            resourceId: resourceA.id,
          }),
        ).rejects.toThrow("Ressource introuvable");
      } finally {
        if (tenantIds.length) {
          const workspaceRows = await db
            .select({ id: schema.workspaces.id })
            .from(schema.workspaces)
            .where(inArray(schema.workspaces.tenantId, tenantIds));
          const workspaceIds = workspaceRows.map((row) => row.id);
          if (workspaceIds.length) {
            await db
              .delete(schema.workRuns)
              .where(inArray(schema.workRuns.workspaceId, workspaceIds));
            await db
              .delete(schema.agents)
              .where(inArray(schema.agents.workspaceId, workspaceIds));
          }
          await db
            .delete(schema.tenants)
            .where(inArray(schema.tenants.id, tenantIds));
        }
        await db.delete(schema.users).where(eq(schema.users.id, user.id));
      }
    },
    20_000,
  );
});
