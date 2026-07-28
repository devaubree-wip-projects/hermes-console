import { describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

mock.module("server-only", () => ({}));

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

describe("Agent team deletion vs assignee constraints", () => {
  databaseTest(
    "deleting a team clears its work-item assignments but refuses while it drives an automation",
    async () => {
      const [{ db }, schema, work] = await Promise.all([
        import("@/db"),
        import("@/db/schema"),
        import("./work-service"),
      ]);
      const suffix = randomUUID().slice(0, 8);
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `team-del-${suffix}@hermes.local`,
          passwordHash: "integration-test-only",
          name: "Team deletion",
        })
        .returning();
      let tenantId: string | null = null;
      try {
        const [tenant] = await db
          .insert(schema.tenants)
          .values({ name: `Team del ${suffix}`, slug: `team-del-${suffix}`, ownerUserId: user.id })
          .returning();
        tenantId = tenant.id;
        const [workspace] = await db
          .insert(schema.workspaces)
          .values({
            tenantId: tenant.id,
            name: "Team del",
            slug: `td-${suffix}`,
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
            name: "Team del Edge",
            installationKey: `team-del-edge-${suffix}`,
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
            slug: "lead",
            name: "Lead",
            hermesProfileName: `td-${suffix}`,
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

        // A team assigned to a live automation cannot be deleted (automations
        // require a non-null assignee).
        const guardedTeam = await work.createWorkspaceAgentTeam({
          context,
          name: `Équipe garde ${suffix}`,
          leadAgentId: agent.id,
        });
        await work.createWorkspaceAutomation({
          context,
          name: `Auto ${suffix}`,
          triggerType: "manual",
          workItemTemplate: { title: "Tâche auto" },
          assignee: { type: "team", teamId: guardedTeam.id },
          active: true,
        });
        await expect(
          work.deleteWorkspaceAgentTeam({ context, teamId: guardedTeam.id }),
        ).rejects.toThrow(/automatisation/);

        // A team assigned only to a backlog work item can be deleted, and the
        // work item is left unassigned (no work_items_assignee_check violation).
        const team = await work.createWorkspaceAgentTeam({
          context,
          name: `Équipe libre ${suffix}`,
          leadAgentId: agent.id,
        });
        const assigned = await work.createWorkspaceWorkItem({
          context,
          title: "Tâche assignée à l’équipe",
          description: "La suppression de l’équipe doit la laisser sans assigné.",
          assignee: { type: "team", teamId: team.id },
          enqueue: false,
        });
        await work.deleteWorkspaceAgentTeam({ context, teamId: team.id });
        const [after] = await db
          .select()
          .from(schema.workItems)
          .where(eq(schema.workItems.id, assigned.item.id));
        expect(after.assigneeType).toBeNull();
        expect(after.assigneeTeamId).toBeNull();
        const [goneTeam] = await db
          .select()
          .from(schema.agentTeams)
          .where(eq(schema.agentTeams.id, team.id));
        expect(goneTeam).toBeUndefined();
      } finally {
        if (tenantId) {
          const tenantWorkspaces = db
            .select({ id: schema.workspaces.id })
            .from(schema.workspaces)
            .where(eq(schema.workspaces.tenantId, tenantId));
          await db.delete(schema.workRuns).where(inArray(schema.workRuns.workspaceId, tenantWorkspaces));
          await db.delete(schema.workAutomations).where(inArray(schema.workAutomations.workspaceId, tenantWorkspaces));
          await db
            .update(schema.workItems)
            .set({ assigneeType: null, assigneeUserId: null, assigneeAgentId: null, assigneeTeamId: null })
            .where(inArray(schema.workItems.workspaceId, tenantWorkspaces));
          await db.delete(schema.agentTeams).where(inArray(schema.agentTeams.workspaceId, tenantWorkspaces));
          await db.delete(schema.agents).where(inArray(schema.agents.workspaceId, tenantWorkspaces));
          await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
        }
        await db.delete(schema.users).where(eq(schema.users.id, user.id));
      }
    },
    20_000,
  );
});
