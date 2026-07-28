import { describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

mock.module("server-only", () => ({}));

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

describe("Project and automation lifecycle PostgreSQL integration", () => {
  databaseTest(
    "renames, changes status and deletes a project without orphaning work items",
    async () => {
      const [{ db }, schema, work, projectService] = await Promise.all([
        import("@/db"),
        import("@/db/schema"),
        import("./work-service"),
        import("./project-service"),
      ]);
      const suffix = randomUUID().slice(0, 8);
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `project-integration-${suffix}@hermes.local`,
          passwordHash: "integration-test-only",
          name: "Project integration",
        })
        .returning();
      let tenantId: string | null = null;
      try {
        const [tenant] = await db
          .insert(schema.tenants)
          .values({
            name: `Project integration ${suffix}`,
            slug: `project-int-${suffix}`,
            ownerUserId: user.id,
          })
          .returning();
        tenantId = tenant.id;
        const [workspace] = await db
          .insert(schema.workspaces)
          .values({
            tenantId: tenant.id,
            name: "Project integration",
            slug: `project-${suffix}`,
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
        const context = {
          tenantId: tenant.id,
          workspaceId: workspace.id,
          workspaceSlug: workspace.slug,
          userId: user.id,
          role: "owner" as const,
        };

        const project = await work.createWorkspaceProject({
          context,
          key: `PRJ${suffix.slice(0, 4)}`.toUpperCase(),
          name: "Nom initial",
        });
        expect(project.status).toBe("active");

        const renamed = await projectService.updateWorkspaceProject({
          context,
          projectId: project.id,
          name: "Nom renommé",
          status: "paused",
        });
        expect(renamed.name).toBe("Nom renommé");
        expect(renamed.status).toBe("paused");

        await expect(
          projectService.updateWorkspaceProject({
            context,
            projectId: randomUUID(),
            status: "active",
          }),
        ).rejects.toThrow("Projet introuvable.");

        const item = await work.createWorkspaceWorkItem({
          context,
          title: "Tâche du projet",
          description: "Doit être détachée, pas supprimée.",
          projectId: project.id,
          enqueue: false,
        });

        const deleted = await projectService.deleteWorkspaceProject({
          context,
          projectId: project.id,
        });
        expect(deleted.id).toBe(project.id);

        const [survivingItem] = await db
          .select()
          .from(schema.workItems)
          .where(eq(schema.workItems.id, item.item.id));
        expect(survivingItem.projectId).toBeNull();

        await expect(
          projectService.deleteWorkspaceProject({
            context,
            projectId: project.id,
          }),
        ).rejects.toThrow("Projet introuvable.");
      } finally {
        if (tenantId) {
          await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
        }
        await db.delete(schema.users).where(eq(schema.users.id, user.id));
      }
    },
    20_000,
  );

  databaseTest(
    "pauses, reactivates and deletes an automation",
    async () => {
      const [{ db }, schema, work, automationService] = await Promise.all([
        import("@/db"),
        import("@/db/schema"),
        import("./work-service"),
        import("./automation-service"),
      ]);
      const suffix = randomUUID().slice(0, 8);
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `automation-integration-${suffix}@hermes.local`,
          passwordHash: "integration-test-only",
          name: "Automation integration",
        })
        .returning();
      let tenantId: string | null = null;
      try {
        const [tenant] = await db
          .insert(schema.tenants)
          .values({
            name: `Automation integration ${suffix}`,
            slug: `automation-int-${suffix}`,
            ownerUserId: user.id,
          })
          .returning();
        tenantId = tenant.id;
        const [workspace] = await db
          .insert(schema.workspaces)
          .values({
            tenantId: tenant.id,
            name: "Automation integration",
            slug: `automation-${suffix}`,
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
        const context = {
          tenantId: tenant.id,
          workspaceId: workspace.id,
          workspaceSlug: workspace.slug,
          userId: user.id,
          role: "owner" as const,
        };

        const automation = await work.createWorkspaceAutomation({
          context,
          name: `Automation ${suffix}`,
          triggerType: "manual",
          workItemTemplate: { title: "Tâche automatisée" },
          assignee: { type: "user", userId: user.id },
          active: true,
        });
        expect(automation.status).toBe("active");

        const paused = await automationService.updateWorkspaceAutomation({
          context,
          automationId: automation.id,
          status: "inactive",
        });
        expect(paused.status).toBe("inactive");

        const reactivated = await automationService.updateWorkspaceAutomation({
          context,
          automationId: automation.id,
          status: "active",
        });
        expect(reactivated.status).toBe("active");

        await expect(
          automationService.updateWorkspaceAutomation({
            context,
            automationId: randomUUID(),
            status: "inactive",
          }),
        ).rejects.toThrow("Automatisation introuvable.");

        const deleted = await automationService.deleteWorkspaceAutomation({
          context,
          automationId: automation.id,
        });
        expect(deleted.id).toBe(automation.id);

        await expect(
          automationService.deleteWorkspaceAutomation({
            context,
            automationId: automation.id,
          }),
        ).rejects.toThrow("Automatisation introuvable.");
      } finally {
        if (tenantId) {
          await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
        }
        await db.delete(schema.users).where(eq(schema.users.id, user.id));
      }
    },
    20_000,
  );
});
