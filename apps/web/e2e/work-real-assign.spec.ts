import { expect, test } from "@playwright/test";
import { loginE2E } from "./hermes-mock";

test.skip(
  process.env.E2E_REAL_WORK !== "1",
  "Set E2E_REAL_WORK=1 against the Docker Hermes + Edge stack.",
);

test("assigning a backlog task from its detail drives a real run while the browser is closed", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await loginE2E(page);
  await page.goto("/e2e/tasks");
  const title = `Assignation réelle ${Date.now()}`;
  await page.getByRole("button", { name: "Nouvelle tâche" }).click();
  await page.getByLabel("Résultat attendu").fill(title);
  await page
    .getByLabel("Contexte et critères de réussite")
    .fill(
      "Utilise todo pour planifier exactement deux étapes : analyser la consigne, puis répondre exactement REAL_WORK_OK. N’utilise aucun outil externe.",
    );
  // Leave "Assignation" on its default "Backlog, non assignée": the task must
  // start unassigned so the detail-side assign control is what triggers the run.
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(page).toHaveURL(/\/e2e\/tasks\?task=[0-9a-f-]+$/);
  const taskId = new URL(page.url()).searchParams.get("task")!;
  const request = context.request;

  // Freshly created task sits in the backlog with no run.
  const initial = await request.get(`/api/e2e/work-items/${taskId}`);
  expect(((await initial.json()) as { item: { status: string } }).item.status).toBe("backlog");

  // Assign to a real agent from the task detail (the #19 fix that was missing).
  await page.getByLabel("Assignation").click();
  await page.getByRole("option", { name: "Assistant principal" }).click();

  // Assignment must enqueue a durable run: the item leaves the backlog.
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/e2e/work-items/${taskId}`);
        if (!response.ok()) return "backlog";
        return ((await response.json()) as { item: { status: string } }).item.status;
      },
      { timeout: 30_000, intervals: [500, 1_000] },
    )
    .not.toBe("backlog");

  await page.close();

  const outcome = { status: "", result: "", failure: "" };
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/e2e/work-items/${taskId}`);
        if (!response.ok()) return false;
        const payload = (await response.json()) as {
          item: { status: string };
          activeRun: { resultSummary?: string | null; failureReason?: string | null } | null;
        };
        Object.assign(outcome, {
          status: payload.item.status,
          result: payload.activeRun?.resultSummary ?? "",
          failure: payload.activeRun?.failureReason ?? "",
        });
        return ["done", "blocked", "cancelled"].includes(payload.item.status);
      },
      { timeout: 150_000, intervals: [1_000, 2_000, 3_000] },
    )
    .toBe(true);
  expect(outcome.status, outcome.failure || "Le run réel n’a pas abouti.").toBe("done");
  expect(outcome.result).toContain("REAL_WORK_OK");
});
