import { describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

mock.module("server-only", () => ({}));

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

describe("Work control plane PostgreSQL integration", () => {
  databaseTest(
    "claims once, projects Hermes todos idempotently and completes the item",
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
          email: `work-integration-${suffix}@hermes.local`,
          passwordHash: "integration-test-only",
          name: "Work integration",
        })
        .returning();
      let tenantId: string | null = null;
      try {
        const [tenant] = await db
          .insert(schema.tenants)
          .values({
            name: `Work integration ${suffix}`,
            slug: `work-int-${suffix}`,
            ownerUserId: user.id,
          })
          .returning();
        tenantId = tenant.id;
        const [workspace] = await db
          .insert(schema.workspaces)
          .values({
            tenantId: tenant.id,
            name: "Work integration",
            slug: `work-${suffix}`,
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
            installationKey: `work-edge-${suffix}`,
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
            hermesProfileName: `work-${suffix}`,
            runtimeState: "ready",
            createdByUserId: user.id,
          })
          .returning();
        const [reviewerAgent] = await db
          .insert(schema.agents)
          .values({
            workspaceId: workspace.id,
            runtimeInstallationId: installation.id,
            slug: "reviewer",
            name: "Reviewer",
            hermesProfileName: `review-${suffix}`,
            runtimeState: "ready",
            createdByUserId: user.id,
          })
          .returning();
        const [qaAgent] = await db
          .insert(schema.agents)
          .values({
            workspaceId: workspace.id,
            runtimeInstallationId: installation.id,
            slug: "qa",
            name: "QA",
            hermesProfileName: `qa-${suffix}`,
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
        const created = await work.createWorkspaceWorkItem({
          context,
          title: "Vérifier le plan Hermes",
          description: "Exécuter deux étapes et publier un résultat.",
          reviewPolicy: "none",
          assignee: { type: "agent", agentId: agent.id },
        });
        expect(created.run?.status).toBe("queued");
        if (!created.run)
          throw new Error("Expected the agent assignment to enqueue a run.");

        const duplicate = await work.enqueueWorkRun({
          context,
          workItemId: created.item.id,
          triggerType: "assignment",
          idempotencyKey: `assignment:${created.item.id}:${agent.id}`,
        });
        expect(duplicate.created).toBe(false);
        expect(duplicate.run.id).toBe(created.run.id);

        const claims = await Promise.all([
          runtime.claimWorkRuns({
            installationId: installation.id,
            edgeId: "edge-a",
            capacity: 1,
          }),
          runtime.claimWorkRuns({
            installationId: installation.id,
            edgeId: "edge-b",
            capacity: 1,
          }),
        ]);
        expect(claims.flat()).toHaveLength(1);
        const claim = claims.flat()[0];
        expect(claim.runId).toBe(created.run.id);
        await expect(
          runtime.startWorkRun({
            runId: claim.runId,
            installationId: installation.id,
            leaseToken: "invalid-lease",
            hermesSessionId: "session-invalid",
          }),
        ).rejects.toThrow("Lease");

        const started = await runtime.startWorkRun({
          runId: claim.runId,
          installationId: installation.id,
          leaseToken: claim.leaseToken,
          hermesSessionId: "session-integration",
        });
        const concurrentItem = await work.createWorkspaceWorkItem({
          context,
          title: "Attendre le profil Hermes",
          description:
            "Deux runs ne doivent pas partager le même profil en parallèle.",
          reviewPolicy: "none",
          assignee: { type: "agent", agentId: agent.id },
        });
        expect(concurrentItem.run?.status).toBe("queued");
        if (!concurrentItem.run)
          throw new Error(
            "Expected the concurrent profile test run to be queued.",
          );
        expect(
          await runtime.claimWorkRuns({
            installationId: installation.id,
            edgeId: "edge-profile-busy",
            capacity: 4,
          }),
        ).toEqual([]);
        const intervention = await runtime.createWorkIntervention({
          runId: claim.runId,
          installationId: installation.id,
          leaseToken: claim.leaseToken,
          requestId: "secret-request-1",
          type: "secret",
          prompt: "Fournir le secret de test",
          safePayload: { provider: "integration" },
        });
        await work.resolveWorkspaceIntervention({
          context,
          interventionId: intervention.id,
          decision: "answered",
          answer: "ephemeral-value-never-in-db",
        });
        const heartbeat = await runtime.heartbeatWorkRun({
          runId: claim.runId,
          installationId: installation.id,
          leaseToken: claim.leaseToken,
        });
        expect(heartbeat.run.status).toBe("running");
        expect(heartbeat.commands).toContainEqual(
          expect.objectContaining({
            interventionType: "secret",
            payload: { value: "ephemeral-value-never-in-db" },
          }),
        );
        const [persistedIntervention] = await db
          .select()
          .from(schema.workInterventions)
          .where(eq(schema.workInterventions.id, intervention.id));
        expect(JSON.stringify(persistedIntervention)).not.toContain(
          "ephemeral-value-never-in-db",
        );
        expect(persistedIntervention.safePayload).toEqual({});
        const planEvent = {
          sequence: started.nextEventSequence,
          type: "tool.complete",
          occurredAt: new Date().toISOString(),
          payload: {
            name: "todo",
            token: "must-not-persist",
            todos: [
              {
                id: "inspect",
                content: "Inspecter le dépôt",
                status: "completed",
              },
              {
                id: "implement",
                content: "Implémenter la correction",
                status: "in_progress",
              },
            ],
          },
        };
        expect(
          await runtime.appendWorkRunEvents({
            runId: claim.runId,
            installationId: installation.id,
            leaseToken: claim.leaseToken,
            events: [planEvent],
          }),
        ).toEqual({ accepted: [planEvent.sequence] });
        expect(
          await runtime.appendWorkRunEvents({
            runId: claim.runId,
            installationId: installation.id,
            leaseToken: claim.leaseToken,
            events: [planEvent],
          }),
        ).toEqual({ accepted: [] });

        const steps = await db
          .select()
          .from(schema.workRunPlanSteps)
          .where(eq(schema.workRunPlanSteps.runId, claim.runId));
        expect(steps.map((step) => [step.hermesStepId, step.status])).toEqual([
          ["inspect", "completed"],
          ["implement", "in_progress"],
        ]);
        const [revision] = await db
          .select()
          .from(schema.workRunPlanRevisions)
          .where(eq(schema.workRunPlanRevisions.runId, claim.runId));
        expect(revision.diagnostics).toEqual([]);
        const promoted = await work.promoteWorkspacePlanStep({
          context,
          runId: claim.runId,
          stepId: steps[0].id,
        });
        const promotedAgain = await work.promoteWorkspacePlanStep({
          context,
          runId: claim.runId,
          stepId: steps[0].id,
        });
        expect(promotedAgain.id).toBe(promoted.id);
        expect(promoted.parentWorkItemId).toBe(created.item.id);
        const [event] = await db
          .select()
          .from(schema.workRunEvents)
          .where(eq(schema.workRunEvents.runId, claim.runId))
          .then((rows) =>
            rows.filter((row) => row.sequence === planEvent.sequence),
          );
        expect(event.payload).not.toHaveProperty("token");
        const privateDelta = {
          sequence: planEvent.sequence + 1,
          type: "reasoning.delta",
          occurredAt: new Date().toISOString(),
          payload: { delta: "private chain of thought" },
        };
        expect(
          await runtime.appendWorkRunEvents({
            runId: claim.runId,
            installationId: installation.id,
            leaseToken: claim.leaseToken,
            events: [privateDelta],
          }),
        ).toEqual({ accepted: [] });
        const privateEvents = await db
          .select()
          .from(schema.workRunEvents)
          .where(eq(schema.workRunEvents.runId, claim.runId));
        expect(
          privateEvents.some((row) => row.type === "reasoning.delta"),
        ).toBe(false);
        const itemCountBeforeDelegation = (
          await db
            .select({ id: schema.workItems.id })
            .from(schema.workItems)
            .where(eq(schema.workItems.workspaceId, workspace.id))
        ).length;
        expect(
          await runtime.appendWorkRunEvents({
            runId: claim.runId,
            installationId: installation.id,
            leaseToken: claim.leaseToken,
            events: [
              {
                sequence: planEvent.sequence + 2,
                type: "subagent.start",
                occurredAt: new Date().toISOString(),
                payload: {
                  subagent_id: "research-branch",
                  child_session_id: "child-session-1",
                  goal: "Vérifier un point en parallèle",
                  files_read: ["/host/private/path"],
                },
              },
              {
                sequence: planEvent.sequence + 3,
                type: "subagent.complete",
                occurredAt: new Date().toISOString(),
                payload: {
                  subagent_id: "research-branch",
                  child_session_id: "child-session-1",
                  status: "completed",
                  summary: "Vérification terminée.",
                  input_tokens: 12,
                  output_tokens: 4,
                },
              },
            ],
          }),
        ).toEqual({
          accepted: [planEvent.sequence + 2, planEvent.sequence + 3],
        });
        const [delegatedRun] = await db
          .select()
          .from(schema.workRuns)
          .where(eq(schema.workRuns.parentRunId, claim.runId));
        expect(delegatedRun.status).toBe("succeeded");
        expect(delegatedRun.hermesSessionId).toBe("child-session-1");
        expect(delegatedRun.resultSummary).toBe("Vérification terminée.");
        expect(
          (
            await db
              .select({ id: schema.workItems.id })
              .from(schema.workItems)
              .where(eq(schema.workItems.workspaceId, workspace.id))
          ).length,
        ).toBe(itemCountBeforeDelegation);
        const delegatedEvents = await db
          .select()
          .from(schema.workRunEvents)
          .where(eq(schema.workRunEvents.runId, claim.runId));
        expect(JSON.stringify(delegatedEvents)).not.toContain(
          "/host/private/path",
        );

        await runtime.completeWorkRun({
          runId: claim.runId,
          installationId: installation.id,
          leaseToken: claim.leaseToken,
          status: "succeeded",
          resultSummary: "Livrable produit.",
        });
        const [item] = await db
          .select()
          .from(schema.workItems)
          .where(eq(schema.workItems.id, created.item.id));
        expect(item.status).toBe("done");
        const comments = await db
          .select()
          .from(schema.workItemComments)
          .where(eq(schema.workItemComments.workItemId, created.item.id));
        expect(comments.at(-1)?.content).toBe("Livrable produit.");

        const [concurrentClaim] = await runtime.claimWorkRuns({
          installationId: installation.id,
          edgeId: "edge-profile-free",
          capacity: 4,
        });
        expect(concurrentClaim.runId).toBe(concurrentItem.run.id);
        await runtime.startWorkRun({
          runId: concurrentClaim.runId,
          installationId: installation.id,
          leaseToken: concurrentClaim.leaseToken,
          hermesSessionId: "session-after-profile-release",
        });
        await runtime.completeWorkRun({
          runId: concurrentClaim.runId,
          installationId: installation.id,
          leaseToken: concurrentClaim.leaseToken,
          status: "succeeded",
          resultSummary: "Profil exécuté séquentiellement.",
        });

        const rerun = await work.enqueueWorkRun({
          context,
          workItemId: created.item.id,
          triggerType: "rerun",
        });
        const [rerunClaim] = await runtime.claimWorkRuns({
          installationId: installation.id,
          edgeId: "edge-rerun",
          capacity: 1,
        });
        expect(rerunClaim.runId).toBe(rerun.run.id);
        expect(rerunClaim.resumeSessionId).toBeNull();
        expect(
          await db
            .select()
            .from(schema.workRunPlanSteps)
            .where(eq(schema.workRunPlanSteps.runId, rerun.run.id)),
        ).toEqual([]);
        await runtime.startWorkRun({
          runId: rerunClaim.runId,
          installationId: installation.id,
          leaseToken: rerunClaim.leaseToken,
          hermesSessionId: "fresh-rerun-session",
        });
        await runtime.completeWorkRun({
          runId: rerunClaim.runId,
          installationId: installation.id,
          leaseToken: rerunClaim.leaseToken,
          status: "succeeded",
          resultSummary: "Rerun indépendant.",
        });

        const retryItem = await work.createWorkspaceWorkItem({
          context,
          title: "Reprendre après coupure Edge",
          description: "Le retry doit reprendre la session Hermes.",
          reviewPolicy: "none",
          assignee: { type: "agent", agentId: agent.id },
        });
        if (!retryItem.run)
          throw new Error("Expected retry test run to be queued.");
        const [retryClaim] = await runtime.claimWorkRuns({
          installationId: installation.id,
          edgeId: "edge-retry-a",
          capacity: 1,
        });
        await runtime.startWorkRun({
          runId: retryClaim.runId,
          installationId: installation.id,
          leaseToken: retryClaim.leaseToken,
          hermesSessionId: "session-to-resume",
        });
        const requeued = await runtime.completeWorkRun({
          runId: retryClaim.runId,
          installationId: installation.id,
          leaseToken: retryClaim.leaseToken,
          status: "failed",
          failureReason: "runtime_disconnected",
        });
        expect(requeued.status).toBe("queued");
        expect(requeued.attempt).toBe(2);
        const [resumedClaim] = await runtime.claimWorkRuns({
          installationId: installation.id,
          edgeId: "edge-retry-b",
          capacity: 1,
        });
        expect(resumedClaim.runId).toBe(retryItem.run.id);
        expect(resumedClaim.resumeSessionId).toBe("session-to-resume");
        await runtime.startWorkRun({
          runId: resumedClaim.runId,
          installationId: installation.id,
          leaseToken: resumedClaim.leaseToken,
          hermesSessionId: "session-to-resume",
        });
        await runtime.completeWorkRun({
          runId: resumedClaim.runId,
          installationId: installation.id,
          leaseToken: resumedClaim.leaseToken,
          status: "succeeded",
          resultSummary: "Reprise réussie.",
        });

        const exhaustedItem = await work.createWorkspaceWorkItem({
          context,
          title: "Épuiser le budget de reprise",
          description:
            "Un lease expiré au dernier essai doit bloquer la tâche.",
          reviewPolicy: "none",
          assignee: { type: "agent", agentId: agent.id },
        });
        if (!exhaustedItem.run)
          throw new Error("Expected exhausted retry test run to be queued.");
        const [exhaustedClaim] = await runtime.claimWorkRuns({
          installationId: installation.id,
          edgeId: "edge-exhausted",
          capacity: 1,
        });
        await db
          .update(schema.workRuns)
          .set({
            status: "running",
            attempt: 3,
            maxAttempts: 3,
            leaseExpiresAt: new Date(0),
          })
          .where(eq(schema.workRuns.id, exhaustedClaim.runId));
        expect(
          await runtime.claimWorkRuns({
            installationId: installation.id,
            edgeId: "edge-after-expiry",
            capacity: 1,
          }),
        ).toEqual([]);
        const [exhaustedRun] = await db
          .select()
          .from(schema.workRuns)
          .where(eq(schema.workRuns.id, exhaustedClaim.runId));
        const [blockedItem] = await db
          .select()
          .from(schema.workItems)
          .where(eq(schema.workItems.id, exhaustedItem.item.id));
        expect(exhaustedRun.status).toBe("failed");
        expect(exhaustedRun.failureReason).toBe("lease_expired");
        expect(blockedItem.status).toBe("blocked");

        const cancellable = await work.createWorkspaceWorkItem({
          context,
          title: "Annuler la tâche entière",
          description:
            "La tâche et son run en attente doivent être annulés ensemble.",
          reviewPolicy: "none",
          assignee: { type: "agent", agentId: agent.id },
        });
        if (!cancellable.run)
          throw new Error("Expected cancellable run to be queued.");
        const cancelled = await work.cancelWorkspaceWorkItem({
          context,
          workItemId: cancellable.item.id,
        });
        expect(cancelled.item.status).toBe("cancelled");
        expect(cancelled.runs).toHaveLength(1);
        expect(cancelled.runs[0].status).toBe("cancelled");

        const autoTeam = await work.createWorkspaceAgentTeam({
          context,
          name: `Équipe auto ${suffix}`,
          leadAgentId: agent.id,
          memberAgentIds: [reviewerAgent.id, qaAgent.id],
          concurrencyLimit: 2,
          delegationPolicy: { autoDelegatePlanSteps: true },
        });
        const teamItem = await work.createWorkspaceWorkItem({
          context,
          title: "Déléguer le plan à un vrai membre",
          description:
            "Le lead planifie, puis la Console crée un run enfant sur le profil reviewer.",
          reviewPolicy: "none",
          assignee: { type: "team", teamId: autoTeam.id },
        });
        if (!teamItem.run)
          throw new Error("Expected the team lead run to be queued.");
        const [teamLeadClaim] = await runtime.claimWorkRuns({
          installationId: installation.id,
          edgeId: "edge-team-lead",
          capacity: 2,
        });
        expect(teamLeadClaim.agentId).toBe(agent.id);
        const teamLeadStarted = await runtime.startWorkRun({
          runId: teamLeadClaim.runId,
          installationId: installation.id,
          leaseToken: teamLeadClaim.leaseToken,
          hermesSessionId: "team-lead-session",
        });
        await runtime.appendWorkRunEvents({
          runId: teamLeadClaim.runId,
          installationId: installation.id,
          leaseToken: teamLeadClaim.leaseToken,
          events: [
            {
              sequence: teamLeadStarted.nextEventSequence,
              type: "tool.complete",
              occurredAt: new Date().toISOString(),
              payload: {
                name: "todo",
                todos: [
                  {
                    id: "lead-analysis",
                    content: "Analyser la demande",
                    status: "in_progress",
                  },
                  {
                    id: "member-review",
                    content: "Relire le livrable",
                    status: "pending",
                  },
                  {
                    id: "member-qa",
                    content: "Valider les critères QA",
                    status: "pending",
                  },
                ],
              },
            },
          ],
        });
        const [delegatedStep] = await db
          .select()
          .from(schema.workRunPlanSteps)
          .where(
            and(
              eq(schema.workRunPlanSteps.runId, teamLeadClaim.runId),
              eq(schema.workRunPlanSteps.hermesStepId, "member-review"),
            ),
          );
        expect(delegatedStep.delegatedRunId).toBeTruthy();
        const memberClaims = await runtime.claimWorkRuns({
          installationId: installation.id,
          edgeId: "edge-team-member",
          capacity: 2,
        });
        expect(memberClaims).toHaveLength(1);
        const memberClaim = memberClaims[0];
        expect([reviewerAgent.id, qaAgent.id]).toContain(memberClaim.agentId);
        await runtime.startWorkRun({
          runId: memberClaim.runId,
          installationId: installation.id,
          leaseToken: memberClaim.leaseToken,
          hermesSessionId: "team-member-session",
        });
        await runtime.completeWorkRun({
          runId: memberClaim.runId,
          installationId: installation.id,
          leaseToken: memberClaim.leaseToken,
          status: "succeeded",
          resultSummary: "Relecture terminée par le membre.",
        });
        const [secondMemberClaim] = await runtime.claimWorkRuns({
          installationId: installation.id,
          edgeId: "edge-team-second-member",
          capacity: 2,
        });
        expect(secondMemberClaim.runId).not.toBe(memberClaim.runId);
        expect([reviewerAgent.id, qaAgent.id]).toContain(
          secondMemberClaim.agentId,
        );
        expect(secondMemberClaim.agentId).not.toBe(memberClaim.agentId);
        await runtime.startWorkRun({
          runId: secondMemberClaim.runId,
          installationId: installation.id,
          leaseToken: secondMemberClaim.leaseToken,
          hermesSessionId: "team-second-member-session",
        });
        await runtime.completeWorkRun({
          runId: secondMemberClaim.runId,
          installationId: installation.id,
          leaseToken: secondMemberClaim.leaseToken,
          status: "succeeded",
          resultSummary: "Validation terminée par le second membre.",
        });
        const [stillRunningTeamItem] = await db
          .select()
          .from(schema.workItems)
          .where(eq(schema.workItems.id, teamItem.item.id));
        expect(stillRunningTeamItem.status).toBe("in_progress");
        const delegatedDetail = await work.getWorkspaceWorkItem(
          workspace.id,
          teamItem.item.id,
        );
        expect(
          delegatedDetail.runs.filter(
            (run) => run.parentRunId === teamLeadClaim.runId,
          ),
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              agentName: "Reviewer",
              agentSlug: "reviewer",
            }),
            expect.objectContaining({ agentName: "QA", agentSlug: "qa" }),
          ]),
        );
        await runtime.completeWorkRun({
          runId: teamLeadClaim.runId,
          installationId: installation.id,
          leaseToken: teamLeadClaim.leaseToken,
          status: "succeeded",
          resultSummary: "Le lead consolide la relecture.",
        });
        const [completedTeamItem] = await db
          .select()
          .from(schema.workItems)
          .where(eq(schema.workItems.id, teamItem.item.id));
        expect(completedTeamItem.status).toBe("done");

        const dependencyItems = await Promise.all(
          ["A", "B", "C"].map((label) =>
            work.createWorkspaceWorkItem({
              context,
              title: `Dépendance ${label}`,
              description: "Vérifier l’acyclicité du graphe.",
              enqueue: false,
            }),
          ),
        );
        await work.addWorkspaceWorkDependency({
          context,
          workItemId: dependencyItems[0].item.id,
          dependsOnWorkItemId: dependencyItems[1].item.id,
        });
        await work.addWorkspaceWorkDependency({
          context,
          workItemId: dependencyItems[1].item.id,
          dependsOnWorkItemId: dependencyItems[2].item.id,
        });
        await expect(
          work.addWorkspaceWorkDependency({
            context,
            workItemId: dependencyItems[2].item.id,
            dependsOnWorkItemId: dependencyItems[0].item.id,
          }),
        ).rejects.toThrow(/cycle/);
        await expect(
          db
            .insert(schema.workItemDependencies)
            .values({
              workItemId: dependencyItems[2].item.id,
              dependsOnWorkItemId: dependencyItems[0].item.id,
              createdByUserId: user.id,
            })
            .then(() => undefined),
        ).rejects.toThrow();
        const label = await work.createWorkspaceWorkLabel({
          context,
          name: `Urgent ${suffix}`,
          color: "#dc2626",
        });
        await work.setWorkspaceWorkItemLabel({
          context,
          workItemId: dependencyItems[0].item.id,
          labelId: label.id,
          attached: true,
        });
        const labelledDetail = await work.getWorkspaceWorkItem(
          workspace.id,
          dependencyItems[0].item.id,
        );
        expect(labelledDetail.labels).toContainEqual(
          expect.objectContaining({ id: label.id, name: `Urgent ${suffix}` }),
        );
        const savedView = await work.createWorkspaceSavedView({
          context,
          name: `Mes urgences ${suffix}`,
          filters: { label: label.id, view: "board", unsafe: "ignored" },
        });
        expect(savedView.filters).toEqual({ label: label.id, view: "board" });
        expect(
          await work.listWorkspaceSavedViews(workspace.id, user.id),
        ).toContainEqual(expect.objectContaining({ id: savedView.id }));

        const resourceItem = await work.createWorkspaceWorkItem({
          context,
          title: "Utiliser une ressource scoppée",
          description:
            "Le contexte Hermes doit référencer uniquement l’URI sûre.",
          enqueue: false,
        });
        await work.createWorkspaceWorkResource({
          context,
          workItemId: resourceItem.item.id,
          kind: "link",
          name: "Documentation publique",
          uri: "https://example.com/reference",
          metadata: { category: "reference", token: "must-not-persist" },
        });
        await expect(
          work.createWorkspaceWorkResource({
            context,
            workItemId: resourceItem.item.id,
            kind: "file",
            name: "Chemin hôte interdit",
            uri: "file:///home/private.txt",
          }),
        ).rejects.toThrow(/work:\/\/resources/);
        const resourceAssignment = await work.assignWorkspaceWorkItem({
          context,
          workItemId: resourceItem.item.id,
          assignee: { type: "agent", agentId: agent.id },
        });
        expect(resourceAssignment.run?.prompt).toContain(
          "https://example.com/reference",
        );
        expect(
          JSON.stringify(resourceAssignment.run?.contextSnapshot),
        ).not.toContain("must-not-persist");
        await work.cancelWorkspaceWorkItem({
          context,
          workItemId: resourceItem.item.id,
        });

        const automation = await work.createWorkspaceAutomation({
          context,
          name: `Automation ${suffix}`,
          triggerType: "manual",
          workItemTemplate: {
            title: "Tâche automatisée",
            description: "Création traçable et dédupliquée.",
          },
          assignee: { type: "user", userId: user.id },
          active: true,
        });
        const automationKey = `integration:${suffix}`;
        const automationFirst = await work.triggerWorkspaceAutomation({
          context,
          automationId: automation.id,
          idempotencyKey: automationKey,
        });
        const automationDuplicate = await work.triggerWorkspaceAutomation({
          context,
          automationId: automation.id,
          idempotencyKey: automationKey,
        });
        expect(automationFirst.created).toBe(true);
        expect(automationDuplicate.created).toBe(false);
        expect(automationDuplicate.item?.id).toBe(automationFirst.item.id);
        const automationHistory = await work.listWorkspaceAutomationRuns(
          workspace.id,
          automation.id,
        );
        expect(automationHistory).toHaveLength(1);
        expect(automationHistory[0].status).toBe("succeeded");

        const eventAutomation = await work.createWorkspaceAutomation({
          context,
          name: `Event automation ${suffix}`,
          triggerType: "event",
          triggerConfig: { event: "work_item.in_progress" },
          workItemTemplate: { title: "Tâche créée par événement" },
          assignee: { type: "user", userId: user.id },
          active: true,
        });
        const eventSource = await work.createWorkspaceWorkItem({
          context,
          title: "Source événementielle",
          description:
            "Le passage en cours déclenche une seule automatisation.",
          status: "todo",
          enqueue: false,
        });
        await work.updateWorkspaceWorkItem({
          context,
          workItemId: eventSource.item.id,
          status: "in_progress",
        });
        await work.updateWorkspaceWorkItem({
          context,
          workItemId: eventSource.item.id,
          status: "in_progress",
        });
        expect(
          await work.listWorkspaceAutomationRuns(
            workspace.id,
            eventAutomation.id,
          ),
        ).toHaveLength(1);

        const cronAutomation = await work.createWorkspaceAutomation({
          context,
          name: `Cron automation ${suffix}`,
          triggerType: "cron",
          triggerConfig: { everyMinutes: 15 },
          workItemTemplate: { title: "Tâche cron" },
          assignee: { type: "user", userId: user.id },
          active: true,
        });
        expect(cronAutomation.nextTriggerAt).toBeInstanceOf(Date);
        const cronResult = await work.triggerWorkspaceAutomation({
          context,
          automationId: cronAutomation.id,
          idempotencyKey: `cron-test:${suffix}`,
        });
        expect(cronResult.created).toBe(true);

        const mentionItem = await work.createWorkspaceWorkItem({
          context,
          title: "Mentionner un agent",
          description:
            "La mention doit cibler l’agent sans réassigner la tâche.",
          enqueue: false,
        });
        const mentioned = await work.addWorkspaceWorkComment({
          context,
          workItemId: mentionItem.item.id,
          content: "@worker peux-tu vérifier ce point ?",
        });
        expect(mentioned.runs).toHaveLength(1);
        expect(mentioned.runs[0].triggerCommentId).toBe(mentioned.comment.id);
        expect(mentioned.runs[0].agentId).toBe(agent.id);
        await work.cancelWorkspaceWorkItem({
          context,
          workItemId: mentionItem.item.id,
        });

        const mentionedTeam = await work.createWorkspaceAgentTeam({
          context,
          name: `Relecture ${suffix}`,
          leadAgentId: agent.id,
        });
        const teamMentionItem = await work.createWorkspaceWorkItem({
          context,
          title: "Mentionner une équipe",
          description: "La mention d’équipe doit cibler son agent lead.",
          enqueue: false,
        });
        const teamMentioned = await work.addWorkspaceWorkComment({
          context,
          workItemId: teamMentionItem.item.id,
          content: `@${mentionedTeam.slug} peux-tu organiser la relecture ?`,
        });
        expect(teamMentioned.runs).toHaveLength(1);
        expect(teamMentioned.runs[0].triggerCommentId).toBe(
          teamMentioned.comment.id,
        );
        expect(teamMentioned.runs[0].agentId).toBe(agent.id);
        await work.cancelWorkspaceWorkItem({
          context,
          workItemId: teamMentionItem.item.id,
        });

        const [relayInstallation] = await db
          .insert(schema.runtimeInstallations)
          .values({
            tenantId: tenant.id,
            name: "Work Relay",
            installationKey: `work-relay-${suffix}`,
            origin: "remote_existing",
            managementLevel: "connected",
            transport: "relay",
            gatewayUrl: "wss://relay.example.test/runtime",
            status: "ready",
            createdByUserId: user.id,
          })
          .returning();
        const [relayAgent] = await db
          .insert(schema.agents)
          .values({
            workspaceId: workspace.id,
            runtimeInstallationId: relayInstallation.id,
            slug: "relay-worker",
            name: "Relay Worker",
            hermesProfileName: `relay-${suffix}`,
            runtimeState: "ready",
            createdByUserId: user.id,
          })
          .returning();
        const relayItem = await work.createWorkspaceWorkItem({
          context,
          title: "Exécuter via Relay",
          description:
            "Le claim reste identique quel que soit le transport de l’installation.",
          assignee: { type: "agent", agentId: relayAgent.id },
        });
        if (!relayItem.run) throw new Error("Expected a Relay Work run.");
        const [relayClaim] = await runtime.claimWorkRuns({
          installationId: relayInstallation.id,
          edgeId: "relay-edge",
          capacity: 1,
        });
        expect(relayClaim.runId).toBe(relayItem.run.id);
        expect(relayClaim.installationId).toBe(relayInstallation.id);
        await runtime.releaseWorkRun({
          runId: relayClaim.runId,
          installationId: relayInstallation.id,
          leaseToken: relayClaim.leaseToken,
          reason: "relay_test_complete",
        });
        await work.cancelWorkspaceWorkItem({
          context,
          workItemId: relayItem.item.id,
        });
      } finally {
        if (tenantId) {
          // Runs and agents hold `restrict` references to runtime_installations,
          // so they must be removed before the tenant cascade reaches it.
          const tenantWorkspaces = db
            .select({ id: schema.workspaces.id })
            .from(schema.workspaces)
            .where(eq(schema.workspaces.tenantId, tenantId));
          await db
            .delete(schema.workRuns)
            .where(inArray(schema.workRuns.workspaceId, tenantWorkspaces));
          await db
            .delete(schema.agentTeams)
            .where(inArray(schema.agentTeams.workspaceId, tenantWorkspaces));
          await db
            .delete(schema.agents)
            .where(inArray(schema.agents.workspaceId, tenantWorkspaces));
          await db
            .delete(schema.tenants)
            .where(eq(schema.tenants.id, tenantId));
        }
        await db.delete(schema.users).where(eq(schema.users.id, user.id));
      }
    },
    20_000,
  );
});
