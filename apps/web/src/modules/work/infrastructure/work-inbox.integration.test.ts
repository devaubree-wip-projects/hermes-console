import { describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

mock.module("server-only", () => ({}));

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

describe("Inbox routing and auto-read PostgreSQL integration", () => {
  databaseTest(
    "resolves work_run inbox targets and auto-reads resolved interventions/runs",
    async () => {
      const [{ db }, schema, work, runtime] = await Promise.all([
        import("@/db"),
        import("@/db/schema"),
        import("./work-service"),
        import("./work-runtime-service"),
      ]);
      const suffix = randomUUID().slice(0, 8);
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `work-inbox-${suffix}@hermes.local`,
          passwordHash: "integration-test-only",
          name: "Work inbox integration",
        })
        .returning();
      let tenantId: string | null = null;
      try {
        const [tenant] = await db
          .insert(schema.tenants)
          .values({
            name: `Work inbox ${suffix}`,
            slug: `work-inbox-${suffix}`,
            ownerUserId: user.id,
          })
          .returning();
        tenantId = tenant.id;
        const [workspace] = await db
          .insert(schema.workspaces)
          .values({
            tenantId: tenant.id,
            name: "Work inbox integration",
            slug: `work-inbox-${suffix}`,
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
            name: "Work Edge",
            installationKey: `work-inbox-edge-${suffix}`,
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
            workspaceId: workspace.id,
            runtimeInstallationId: installation.id,
            slug: "worker",
            name: "Worker",
            hermesProfileName: `work-inbox-${suffix}`,
            runtimeState: "ready",
            createdByUserId: user.id,
          })
          .returning();
        const context = {
          tenantId: tenant.id,
          workspaceId: workspace.id,
          workspaceSlug: workspace.slug,
          userId: user.id,
          role: "owner" as const,
        };

        // Review policy "required" so a successful run creates a real
        // deliverable_review inbox item whose source is the run, not the item.
        const created = await work.createWorkspaceWorkItem({
          context,
          title: "Livrable à relire",
          description: "Vérifier que le lien de l'inbox pointe vers la tâche.",
          reviewPolicy: "required",
          assignee: { type: "agent", agentId: agent.id },
        });
        if (!created.run) throw new Error("Expected the assignment to enqueue a run.");

        const [claim] = await runtime.claimWorkRuns({
          installationId: installation.id,
          edgeId: "edge-inbox",
          capacity: 1,
        });
        await runtime.startWorkRun({
          runId: claim.runId,
          installationId: installation.id,
          leaseToken: claim.leaseToken,
          hermesSessionId: "session-inbox",
        });

        // Intervention resolution must mark the matching inbox item read for
        // every recipient (the tenant owner is an implicit recipient here).
        const intervention = await runtime.createWorkIntervention({
          runId: claim.runId,
          installationId: installation.id,
          leaseToken: claim.leaseToken,
          requestId: "clarify-1",
          type: "clarification",
          prompt: "Confirmer le périmètre ?",
        });
        const [unreadIntervention] = await db
          .select()
          .from(schema.inboxItems)
          .where(
            and(
              eq(schema.inboxItems.sourceType, "work_intervention"),
              eq(schema.inboxItems.sourceId, intervention.id),
              eq(schema.inboxItems.userId, user.id),
            ),
          );
        expect(unreadIntervention.readAt).toBeNull();
        await work.resolveWorkspaceIntervention({
          context,
          interventionId: intervention.id,
          decision: "answered",
          answer: "Oui",
        });
        const [readIntervention] = await db
          .select()
          .from(schema.inboxItems)
          .where(eq(schema.inboxItems.id, unreadIntervention.id));
        expect(readIntervention.readAt).not.toBeNull();

        // Simulate a stale work_run notice (e.g. a previous failure) still
        // unread for this run: a later successful completion must clear it.
        const [staleNotice] = await db
          .insert(schema.inboxItems)
          .values({
            workspaceId: workspace.id,
            userId: user.id,
            type: "work_run_failed",
            sourceType: "work_run",
            sourceId: claim.runId,
            reason: "Notice de test antérieure.",
          })
          .onConflictDoNothing()
          .returning();

        await runtime.heartbeatWorkRun({
          runId: claim.runId,
          installationId: installation.id,
          leaseToken: claim.leaseToken,
        });
        await runtime.completeWorkRun({
          runId: claim.runId,
          installationId: installation.id,
          leaseToken: claim.leaseToken,
          status: "succeeded",
          resultSummary: "Livrable produit, en attente de relecture.",
        });

        const [item] = await db
          .select()
          .from(schema.workItems)
          .where(eq(schema.workItems.id, created.item.id));
        expect(item.status).toBe("review");

        if (staleNotice) {
          const [resolvedStale] = await db
            .select()
            .from(schema.inboxItems)
            .where(eq(schema.inboxItems.id, staleNotice.id));
          expect(resolvedStale.readAt).not.toBeNull();
        }

        // The deliverable_review item created by this very completion must
        // remain unread, and must resolve back to the work item via the
        // routing join in listWorkspaceInbox (finding #1).
        const inbox = await work.listWorkspaceInbox({
          workspaceId: workspace.id,
          userId: user.id,
        });
        const reviewEntry = inbox.find(
          (row) => row.sourceType === "work_run" && row.type === "deliverable_review",
        );
        expect(reviewEntry).toBeDefined();
        expect(reviewEntry?.readAt).toBeNull();
        expect(reviewEntry?.targetWorkItemId).toBe(created.item.id);
      } finally {
        if (tenantId) {
          const tenantWorkspaces = db
            .select({ id: schema.workspaces.id })
            .from(schema.workspaces)
            .where(eq(schema.workspaces.tenantId, tenantId));
          await db.delete(schema.workRuns).where(inArray(schema.workRuns.workspaceId, tenantWorkspaces));
          // Clear assignees before removing agents: assignee_agent_id is ON DELETE
          // SET NULL, which would violate work_items_assignee_check while the type
          // column still reads 'agent'.
          await db
            .update(schema.workItems)
            .set({ assigneeType: null, assigneeUserId: null, assigneeAgentId: null, assigneeTeamId: null })
            .where(inArray(schema.workItems.workspaceId, tenantWorkspaces));
          await db.delete(schema.agents).where(inArray(schema.agents.workspaceId, tenantWorkspaces));
          await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
        }
        await db.delete(schema.users).where(eq(schema.users.id, user.id));
      }
    },
    20_000,
  );
});
