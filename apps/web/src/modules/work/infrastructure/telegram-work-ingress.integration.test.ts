import { describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

mock.module("server-only", () => ({}));

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

describe("Telegram Work ingress PostgreSQL integration", () => {
  databaseTest(
    "resolves the signed installation profile and records Telegram provenance",
    async () => {
      const [{ db }, schema, ingress] = await Promise.all([
        import("@/db"),
        import("@/db/schema"),
        import("./telegram-work-ingress"),
      ]);
      const suffix = randomUUID().slice(0, 8);
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `telegram-work-${suffix}@hermes.local`,
          passwordHash: "integration-test-only",
          name: "Telegram Work integration",
        })
        .returning();
      let tenantId: string | null = null;
      try {
        const [tenant] = await db
          .insert(schema.tenants)
          .values({
            name: `Telegram Work ${suffix}`,
            slug: `telegram-work-${suffix}`,
            ownerUserId: user.id,
          })
          .returning();
        tenantId = tenant.id;
        const [workspace] = await db
          .insert(schema.workspaces)
          .values({
            tenantId: tenant.id,
            name: "Telegram Work",
            slug: `telegram-${suffix}`,
            hermesBaseUrl: "http://127.0.0.1:9119",
            permissions: {
              read_files: true,
              web_search: true,
              generate_reports: true,
              propose_changes: true,
              edit_files: false,
              send_emails: false,
              open_prs: false,
            },
          })
          .returning();
        const [installation] = await db
          .insert(schema.runtimeInstallations)
          .values({
            tenantId: tenant.id,
            name: "Telegram Edge",
            installationKey: `telegram-edge-${suffix}`,
            origin: "local_managed",
            managementLevel: "managed",
            transport: "direct",
            gatewayUrl: "http://127.0.0.1:8787",
            status: "ready",
            createdByUserId: user.id,
          })
          .returning();
        const profile = `telegram-${suffix}`;
        const [agent] = await db
          .insert(schema.agents)
          .values({
            workspaceId: workspace.id,
            runtimeInstallationId: installation.id,
            slug: "telegram-worker",
            name: "Telegram Worker",
            hermesProfileName: profile,
            runtimeState: "ready",
            createdByUserId: user.id,
          })
          .returning();

        const created = await ingress.createTelegramWorkItem({
          installationIds: [installation.id],
          profile,
          title: "Corriger la pagination",
          description: "Ajouter le test de régression.",
          telegramUserId: "42",
          telegramChatId: "100",
          telegramMessageId: "77",
          telegramUpdateId: 88,
        });

        expect(created.item.workspaceId).toBe(workspace.id);
        expect(created.item.assigneeAgentId).toBe(agent.id);
        expect(created.item.creatorUserId).toBe(user.id);
        expect(created.run?.status).toBe("queued");
        const [audit] = await db
          .select()
          .from(schema.auditEvents)
          .where(
            and(
              eq(schema.auditEvents.targetId, created.item.id),
              eq(schema.auditEvents.action, "work_item.created"),
            ),
          )
          .limit(1);
        expect(audit.metadata).toEqual(
          expect.objectContaining({
            source: "telegram",
            telegramUserId: "42",
            telegramChatId: "100",
            telegramMessageId: "77",
            telegramUpdateId: 88,
          }),
        );
      } finally {
        if (tenantId) {
          // agents/runs hold ON DELETE RESTRICT references to the installation,
          // so a naive tenant delete violates the FK. Use the production erase
          // path, which removes rows in dependency order.
          const { deleteTenantAndData } = await import("@/lib/tenant-deletion");
          await deleteTenantAndData(tenantId);
        }
        await db.delete(schema.users).where(eq(schema.users.id, user.id));
      }
    },
    20_000,
  );
});
