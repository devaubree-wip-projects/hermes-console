import { createHash, createHmac, randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  GATEWAY_SERVICE_HEADERS,
  GATEWAY_WORK_PATHS,
} from "@hermes-console/shared/gateway";
import { loginE2E, loginViewerE2E } from "./hermes-mock";

const installationKey =
  process.env.E2E_REAL_WORK === "1" ? "local-default" : "e2e-work";
const profile = "default";

function deriveServiceSecret() {
  const master =
    process.env.HERMES_GATEWAY_SERVICE_SECRET ??
    process.env.HERMES_GATEWAY_TICKET_SECRET ??
    "hermes-console-local-development";
  if (process.env.HERMES_GATEWAY_DERIVE_SECRETS === "false") return master;
  return createHmac("sha256", master)
    .update(`hermes-console:service:${installationKey}`)
    .digest("base64url");
}

async function runtimePost<T>(
  request: APIRequestContext,
  path: string,
  input: Record<string, unknown>,
) {
  const body = JSON.stringify(input);
  const timestamp = Date.now();
  const nonce = randomBytes(24).toString("hex");
  const digest = createHash("sha256").update(body).digest("hex");
  const canonical = [
    "POST",
    path,
    String(timestamp),
    nonce,
    profile,
    digest,
  ].join("\n");
  const signature = createHmac("sha256", deriveServiceSecret())
    .update(canonical)
    .digest("base64url");
  const response = await request.post(path, {
    headers: {
      "Content-Type": "application/json",
      [GATEWAY_SERVICE_HEADERS.installation]: installationKey,
      [GATEWAY_SERVICE_HEADERS.profile]: profile,
      [GATEWAY_SERVICE_HEADERS.timestamp]: String(timestamp),
      [GATEWAY_SERVICE_HEADERS.nonce]: nonce,
      [GATEWAY_SERVICE_HEADERS.signature]: signature,
    },
    data: Buffer.from(body),
  });
  const payload = await response.json();
  expect(response.ok(), JSON.stringify(payload)).toBe(true);
  return payload as T;
}

test("executes a durable Work task and renders the live Hermes plan without opening Chat", async ({
  page,
}) => {
  await loginE2E(page);
  await page.goto("/e2e/e2e/tasks");
  await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Projets" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Agents et équipes" }),
  ).toBeVisible();
  const title = `Plan Hermes ${Date.now()}`;
  await page.getByRole("button", { name: "Nouvelle tâche" }).click();
  await page.getByLabel("Résultat attendu").fill(title);
  await page
    .getByLabel("Contexte et critères de réussite")
    .fill("Produire un livrable en suivant deux étapes visibles.");
  await page.getByLabel("Assignation").click();
  await page.getByRole("option", { name: "Assistant principal" }).click();
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(page).toHaveURL(/\/e2e\/e2e\/tasks\/[0-9a-f-]+$/);
  const originalTaskUrl = page.url();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  expect(page.url()).not.toContain("/d/chat");
  const claimResponse = await runtimePost<{
    runs: Array<{
      runId: string;
      title: string;
      leaseToken: string;
      installationId: string;
    }>;
  }>(page.request, GATEWAY_WORK_PATHS.claim, {
    edgeId: "playwright-edge",
    capacity: 16,
  });
  const run = claimResponse.runs.find((candidate) => candidate.title === title);
  expect(
    run,
    "The newly created task must be claimed by the Edge API",
  ).toBeTruthy();
  const installationId = run!.installationId;
  const started = await runtimePost<{ nextEventSequence: number }>(
    page.request,
    `/api/runtime/work/runs/${run!.runId}/start`,
    {
      installationId,
      leaseToken: run!.leaseToken,
      hermesSessionId: `e2e-work-${Date.now()}`,
    },
  );
  await runtimePost(
    page.request,
    `/api/runtime/work/runs/${run!.runId}/events`,
    {
      installationId,
      leaseToken: run!.leaseToken,
      events: [
        {
          sequence: started.nextEventSequence,
          type: "tool.complete",
          occurredAt: new Date().toISOString(),
          payload: {
            name: "todo",
            todos: [
              {
                id: "inspect",
                content: "Inspecter la demande",
                status: "completed",
              },
              {
                id: "deliver",
                content: "Produire le livrable",
                status: "in_progress",
              },
            ],
          },
        },
      ],
    },
  );
  await expect(page.getByText("Inspecter la demande")).toBeVisible();
  await expect(page.getByText("Produire le livrable")).toBeVisible();
  await expect(page.getByText("1/2")).toBeVisible();

  const approvalPrompt = `Autoriser la publication du livrable E2E ${Date.now()} ?`;
  const intervention = await runtimePost<{ intervention: { id: string } }>(
    page.request,
    `/api/runtime/work/runs/${run!.runId}/interventions`,
    {
      installationId,
      leaseToken: run!.leaseToken,
      requestId: `approval-${Date.now()}`,
      type: "approval",
      prompt: approvalPrompt,
      safePayload: { tool: "publish", token: "must-not-persist" },
    },
  );
  expect(intervention.intervention.id).toBeTruthy();
  await page.goto("/e2e/e2e/inbox");
  await expect(
    page.getByText(/intervention approval requiert votre attention/i).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tout marquer comme lu" }).click();
  await page.goto("/e2e/e2e/approvals");
  const approvalCard = page
    .locator("article")
    .filter({ hasText: approvalPrompt });
  await expect(approvalCard.getByText(approvalPrompt)).toBeVisible();
  await approvalCard.getByRole("button", { name: "Approuver" }).click();
  await expect(
    page.getByText("approved", { exact: true }).first(),
  ).toBeVisible();
  const resumed = await runtimePost<{
    commands: Array<{ interventionId: string; decision: string }>;
  }>(page.request, `/api/runtime/work/runs/${run!.runId}/heartbeat`, {
    installationId,
    leaseToken: run!.leaseToken,
  });
  expect(resumed.commands).toContainEqual(
    expect.objectContaining({
      interventionId: intervention.intervention.id,
      decision: "approved",
    }),
  );
  await page.goto(originalTaskUrl);

  await page.reload();
  await expect(page.getByText("Inspecter la demande")).toBeVisible();
  await expect(page.getByText("1/2")).toBeVisible();
  await page
    .getByRole("button", { name: "Promouvoir en sous-tâche" })
    .first()
    .click();
  await expect(page).not.toHaveURL(originalTaskUrl);
  await expect(
    page.getByRole("heading", { name: "Inspecter la demande" }),
  ).toBeVisible();
  await page.goto(originalTaskUrl);
  await expect(page.getByRole("link", { name: "Sous-tâche" })).toBeVisible();

  await runtimePost(
    page.request,
    `/api/runtime/work/runs/${run!.runId}/events`,
    {
      installationId,
      leaseToken: run!.leaseToken,
      events: [
        {
          sequence: started.nextEventSequence + 1,
          type: "tool.complete",
          occurredAt: new Date().toISOString(),
          payload: {
            name: "todo",
            todos: [
              {
                id: "inspect",
                content: "Inspecter la demande",
                status: "completed",
              },
              {
                id: "deliver",
                content: "Produire le livrable",
                status: "completed",
              },
            ],
          },
        },
      ],
    },
  );
  await expect(page.getByText("2/2")).toBeVisible();
  await page
    .getByLabel("Ajouter un commentaire")
    .fill("Contrôle humain E2E terminé.");
  await page.getByRole("button", { name: "Publier" }).click();
  await expect(page.getByText("Contrôle humain E2E terminé.")).toBeVisible();

  await runtimePost(
    page.request,
    `/api/runtime/work/runs/${run!.runId}/complete`,
    {
      installationId,
      leaseToken: run!.leaseToken,
      status: "succeeded",
      resultSummary: "Livrable fonctionnel produit par Hermes.",
    },
  );
  await expect(page.getByText("Terminée", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Livrable fonctionnel produit par Hermes.").first(),
  ).toBeVisible();
  expect(page.url()).not.toContain("autostart");
});

test("creates projects, agent teams and traceable automations from Work", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await loginE2E(page);
  const suffix = Date.now().toString().slice(-7);

  await page.goto("/e2e/e2e/projects");
  await page.getByRole("button", { name: "Nouveau projet" }).click();
  await page.getByLabel("Clé").fill(`P${suffix}`);
  await page.getByLabel("Nom").fill(`Projet fonctionnel ${suffix}`);
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(page.getByText(`Projet fonctionnel ${suffix}`)).toBeVisible();

  await page.goto("/e2e/e2e/agents");
  await page.getByRole("button", { name: "Nouvelle équipe" }).click();
  await page.getByLabel("Nom de l’équipe").fill(`Équipe ${suffix}`);
  await page.getByRole("combobox", { name: "Agent lead" }).click();
  await page
    .getByRole("option", { name: "Assistant principal", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Reviewer" }).click();
  await page
    .getByRole("checkbox", {
      name: "Déléguer automatiquement les étapes planifiées",
    })
    .click();
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  const createdTeamRow = page
    .locator("li")
    .filter({ hasText: `Équipe ${suffix}` })
    .first();
  await expect(createdTeamRow).toBeVisible();
  await expect(createdTeamRow.getByText("plan auto-délégué")).toBeVisible();

  const teamsResponse = await page.request.get("/api/e2e/e2e/agent-teams");
  const teamsPayload = (await teamsResponse.json()) as {
    teams: Array<{ id: string; name: string }>;
  };
  const teamId = teamsPayload.teams.find(
    (team) => team.name === `Équipe ${suffix}`,
  )?.id;
  expect(teamId).toBeTruthy();
  const delegatedTitle = `Plan délégué ${suffix}`;
  const delegatedTaskResponse = await page.request.post(
    "/api/e2e/e2e/work-items",
    {
      data: {
        title: delegatedTitle,
        description: "Le lead doit déléguer une étape à Reviewer.",
        reviewPolicy: "none",
        assignee: { type: "team", teamId },
      },
    },
  );
  expect(delegatedTaskResponse.status()).toBe(201);
  const delegatedTask = (await delegatedTaskResponse.json()) as {
    item: { id: string };
  };
  const teamClaimResponse = await runtimePost<{
    runs: Array<{
      runId: string;
      title: string;
      leaseToken: string;
      installationId: string;
      agentId: string;
    }>;
  }>(page.request, GATEWAY_WORK_PATHS.claim, {
    edgeId: "playwright-team-lead",
    capacity: 16,
  });
  const teamLeadRun = teamClaimResponse.runs.find(
    (candidate) => candidate.title === delegatedTitle,
  );
  expect(teamLeadRun).toBeTruthy();
  const teamStarted = await runtimePost<{ nextEventSequence: number }>(
    page.request,
    `/api/runtime/work/runs/${teamLeadRun!.runId}/start`,
    {
      installationId: teamLeadRun!.installationId,
      leaseToken: teamLeadRun!.leaseToken,
      hermesSessionId: `e2e-team-lead-${suffix}`,
    },
  );
  await runtimePost(
    page.request,
    `/api/runtime/work/runs/${teamLeadRun!.runId}/events`,
    {
      installationId: teamLeadRun!.installationId,
      leaseToken: teamLeadRun!.leaseToken,
      events: [
        {
          sequence: teamStarted.nextEventSequence,
          type: "tool.complete",
          occurredAt: new Date().toISOString(),
          payload: {
            name: "todo",
            todos: [
              {
                id: "lead",
                content: "Préparer le livrable",
                status: "in_progress",
              },
              {
                id: "review",
                content: "Relire avec le profil Reviewer",
                status: "pending",
              },
            ],
          },
        },
      ],
    },
  );
  await page.goto(`/e2e/e2e/tasks/${delegatedTask.item.id}`);
  const delegationSection = page
    .getByRole("heading", { name: "Délégations Hermes" })
    .locator("..");
  await expect(delegationSection).toBeVisible();
  await expect(
    delegationSection.getByText("Relire avec le profil Reviewer"),
  ).toBeVisible();
  await expect(
    delegationSection.getByText("Reviewer @reviewer", { exact: false }),
  ).toBeVisible();
  await runtimePost(
    page.request,
    `/api/runtime/work/runs/${teamLeadRun!.runId}/complete`,
    {
      installationId: teamLeadRun!.installationId,
      leaseToken: teamLeadRun!.leaseToken,
      status: "succeeded",
      resultSummary: "Plan consolidé par le lead.",
    },
  );

  await page.goto("/e2e/e2e/automations");
  await page.getByRole("button", { name: "Nouvelle automatisation" }).click();
  await page.getByLabel("Nom").fill(`Automatisation ${suffix}`);
  await page.getByLabel("Tâche créée").fill(`Tâche automatique ${suffix}`);
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  const automationRow = page
    .locator("li", { hasText: `Automatisation ${suffix}` })
    .first();
  await expect(automationRow).toBeVisible();
  await automationRow.getByRole("button", { name: "Exécuter" }).click();
  await expect(page).toHaveURL(/\/e2e\/e2e\/tasks\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { name: `Tâche automatique ${suffix}` }),
  ).toBeVisible();
  await page.goto(
    `/e2e/e2e/tasks?view=board&q=${encodeURIComponent(`Tâche automatique ${suffix}`)}`,
  );
  await expect(
    page.getByText("utilisez son sélecteur d’état au clavier", {
      exact: false,
    }),
  ).toBeVisible();
  const taskCard = page
    .locator("li", { hasText: `Tâche automatique ${suffix}` })
    .first();
  await taskCard.getByRole("combobox").selectOption("in_progress");
  await expect(taskCard.getByRole("combobox")).toHaveValue("in_progress");
  await page.getByRole("button", { name: "Enregistrer la vue" }).click();
  await page.getByLabel("Nom de la vue").fill(`Vue board ${suffix}`);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByLabel("Ouvrir une vue enregistrée")).toBeVisible();
  await page.goto("/e2e/e2e/automations");
  await expect(
    page.getByRole("heading", { name: "Historique des déclenchements" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Voir la tâche" }).first(),
  ).toBeVisible();

  const automationResponse = await page.request.get("/api/e2e/e2e/automations");
  const automationPayload = (await automationResponse.json()) as {
    automations: Array<{ name: string; assigneeAgentId: string }>;
  };
  const agentId = automationPayload.automations.find(
    (entry) => entry.name === `Automatisation ${suffix}`,
  )?.assigneeAgentId;
  expect(agentId).toBeTruthy();
  const webhookName = `Webhook ${suffix}`;
  const createdWebhook = await page.request.post("/api/e2e/e2e/automations", {
    data: {
      name: webhookName,
      triggerType: "webhook",
      triggerConfig: {},
      timezone: "Europe/Paris",
      workItemTemplate: { title: `Tâche webhook ${suffix}` },
      assignee: { type: "agent", agentId },
      active: true,
    },
  });
  expect(createdWebhook.status()).toBe(201);
  const webhook = (await createdWebhook.json()) as {
    automation: { id: string };
    webhookSecret: string;
  };
  expect(webhook.webhookSecret).toBeTruthy();
  const hookOptions = {
    headers: {
      "x-work-hook-secret": webhook.webhookSecret,
      "x-idempotency-key": `hook-${suffix}`,
    },
    data: { eventId: `hook-${suffix}` },
  };
  const firstHook = await page.request.post(
    `/api/work-hooks/${webhook.automation.id}`,
    hookOptions,
  );
  const firstHookPayload = (await firstHook.json()) as {
    created: boolean;
    workItemId: string;
  };
  expect(firstHook.status()).toBe(201);
  const duplicateHook = await page.request.post(
    `/api/work-hooks/${webhook.automation.id}`,
    hookOptions,
  );
  const duplicateHookPayload = (await duplicateHook.json()) as {
    created: boolean;
    workItemId: string;
  };
  expect(duplicateHook.status()).toBe(200);
  expect(duplicateHookPayload.created).toBe(false);
  expect(duplicateHookPayload.workItemId).toBe(firstHookPayload.workItemId);
});

test("keeps Viewer access strictly read-only across Work UI and API", async ({
  page,
}) => {
  await loginViewerE2E(page);
  await page.goto("/e2e/e2e/tasks");
  await expect(
    page.getByRole("button", { name: "Nouvelle tâche" }),
  ).toHaveCount(0);
  const firstTask = page.locator('a[href^="/e2e/e2e/tasks/"]').first();
  await expect(firstTask).toBeVisible();
  await firstTask.click();
  await expect(page.getByLabel("Ajouter un commentaire")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Relancer|Annuler/ }),
  ).toHaveCount(0);
  const forbidden = await page.request.post("/api/e2e/e2e/work-items", {
    data: { title: "Interdit au viewer", description: "Mutation refusée." },
  });
  expect(forbidden.status()).toBe(403);
});
