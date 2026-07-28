import { describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";

mock.module("server-only", () => ({}));

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

// The origin bug: a technically successful run marked the task "done" even when
// it delivered nothing. These tests prove the J1 contract end-to-end on a real
// Postgres — delivery is judged from evidence, and no run starts without matter.
describe("Work delivery truth (PostgreSQL integration)", () => {
  databaseTest(
    "a succeeded run without a deliverable blocks the task; with one it completes",
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
          email: `delivery-truth-${suffix}@hermes.local`,
          passwordHash: "integration-test-only",
          name: "Delivery truth integration",
        })
        .returning();
      let tenantId: string | null = null;
      try {
        const [tenant] = await db
          .insert(schema.tenants)
          .values({
            name: `Delivery truth ${suffix}`,
            slug: `delivery-truth-${suffix}`,
            ownerUserId: user.id,
          })
          .returning();
        tenantId = tenant.id;
        const [workspace] = await db
          .insert(schema.workspaces)
          .values({
            tenantId: tenant.id,
            name: "Delivery truth",
            slug: `delivery-${suffix}`,
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
            name: "Delivery Edge",
            installationKey: `delivery-edge-${suffix}`,
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
            hermesProfileName: `delivery-${suffix}`,
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

        // Runs the assignment through claim -> start -> complete and returns the
        // work item's status plus the delivery reason recorded on the run event.
        async function runToCompletion(input: {
          title: string;
          description: string;
          resultSummary: string;
          // Lets a case set the world up between claim and completion, e.g. leave a
          // delegated child run in flight so the parent's completion cuts it off.
          beforeComplete?: (state: {
            runId: string;
            workItemId: string;
          }) => Promise<void>;
        }) {
          const created = await work.createWorkspaceWorkItem({
            context,
            title: input.title,
            description: input.description,
            reviewPolicy: "none",
            assignee: { type: "agent", agentId: agent.id },
          });
          if (!created.run)
            throw new Error("Expected the assignment to enqueue a run.");
          const claim = (
            await runtime.claimWorkRuns({
              installationId: installation.id,
              edgeId: `edge-${randomUUID().slice(0, 6)}`,
              capacity: 1,
            })
          ).find((entry) => entry.runId === created.run!.id);
          if (!claim) throw new Error("Expected to claim the queued run.");
          await runtime.startWorkRun({
            runId: claim.runId,
            installationId: installation.id,
            leaseToken: claim.leaseToken,
            hermesSessionId: `session-${suffix}`,
          });
          await input.beforeComplete?.({
            runId: claim.runId,
            workItemId: created.item.id,
          });
          await runtime.completeWorkRun({
            runId: claim.runId,
            installationId: installation.id,
            leaseToken: claim.leaseToken,
            status: "succeeded",
            resultSummary: input.resultSummary,
          });
          const [item] = await db
            .select({ status: schema.workItems.status })
            .from(schema.workItems)
            .where(eq(schema.workItems.id, created.item.id));
          const [event] = await db
            .select({ payload: schema.workRunEvents.payload })
            .from(schema.workRunEvents)
            .where(
              and(
                eq(schema.workRunEvents.runId, claim.runId),
                eq(schema.workRunEvents.type, "run.succeeded"),
              ),
            )
            .orderBy(desc(schema.workRunEvents.sequence))
            .limit(1);
          return { status: item.status, event };
        }

        // The origin bug: succeeded run, but the summary is meta and nothing
        // else was produced -> blocked with reason no_deliverable, never done.
        const empty = await runToCompletion({
          title: "Ne rien produire",
          description: "Le brief demande explicitement de ne rien livrer.",
          resultSummary: "Dossier vide.",
        });
        expect(empty.status).toBe("blocked");
        expect(empty.status).not.toBe("done");
        expect(
          (empty.event?.payload as { deliveryReason?: string } | null)
            ?.deliveryReason,
        ).toBe("no_deliverable");

        // Contrast: a real deliverable on a none-review task completes it.
        const delivered = await runToCompletion({
          title: "Produire un vrai livrable",
          description: "Le brief attend un résumé actionnable.",
          resultSummary:
            "Rapport livré : trois axes chiffrés et la recommandation finale.",
        });
        expect(delivered.status).toBe("done");
        expect(
          (delivered.event?.payload as { deliveryReason?: string } | null)
            ?.deliveryReason ?? null,
        ).toBeNull();

        // Observed for real: an agent delegates to subagents, closes its turn while
        // they are still working, and reports success. The children get cut off, so
        // what they owed is missing — a confident summary must not buy `done`.
        const abandoned = await runToCompletion({
          title: "Déléguer puis conclure trop tôt",
          description: "Le brief demande de déléguer trois variantes à des subagents.",
          resultSummary:
            "Délégation lancée à trois subagents ; les fichiers arrivent sous peu.",
          beforeComplete: async ({ runId, workItemId }) => {
            await db.insert(schema.workRuns).values({
              workItemId,
              workspaceId: workspace.id,
              agentId: agent.id,
              runtimeInstallationId: installation.id,
              hermesProfileName: agent.hermesProfileName,
              parentRunId: runId,
              triggerType: "delegation",
              status: "running",
              originatorUserId: user.id,
              prompt: "Produire une variante déléguée.",
              idempotencyKey: `delegation-${randomUUID()}`,
            });
          },
        });
        expect(abandoned.status).toBe("blocked");
        expect(abandoned.status).not.toBe("done");
        expect(
          (abandoned.event?.payload as { deliveryReason?: string } | null)
            ?.deliveryReason,
        ).toBe("abandoned_delegations");

        // The pre-enqueue gate: no matter, no run.
        const bare = await work.createWorkspaceWorkItem({
          context,
          title: "Tâche sans matière",
          description: "",
        });
        await expect(
          work.enqueueWorkRun({
            context,
            workItemId: bare.item.id,
            triggerType: "assignment",
            forceAgentId: agent.id,
          }),
        ).rejects.toThrow(/matière/);
      } finally {
        if (tenantId) {
          const { deleteTenantAndData } = await import("@/lib/tenant-deletion");
          await deleteTenantAndData(tenantId);
        }
        await db.delete(schema.users).where(eq(schema.users.id, user.id));
      }
    },
    30_000,
  );
});
