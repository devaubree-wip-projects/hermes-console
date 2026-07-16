import { expect, test } from "@playwright/test";
import { loginE2E } from "./hermes-mock";

test.skip(
  process.env.E2E_REAL_WORK !== "1",
  "Set E2E_REAL_WORK=1 against the Docker Hermes + Edge stack.",
);

test("executes through the real Docker Edge and Hermes while the browser is closed", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await loginE2E(page);
  await page.goto("/e2e/e2e/tasks");
  const title = `Hermes Docker réel ${Date.now()}`;
  await page.getByRole("button", { name: "Nouvelle tâche" }).click();
  await page.getByLabel("Résultat attendu").fill(title);
  await page
    .getByLabel("Contexte et critères de réussite")
    .fill(
      "Utilise todo pour planifier exactement deux étapes : analyser la consigne, puis répondre exactement REAL_WORK_OK. N’utilise aucun outil externe.",
    );
  await page.getByLabel("Assignation").click();
  await page.getByRole("option", { name: "Assistant principal" }).click();
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(page).toHaveURL(/\/e2e\/e2e\/tasks\/[0-9a-f-]+$/);
  const taskUrl = page.url();
  const taskId = taskUrl.split("/").at(-1)!;
  const request = context.request;
  await page.close();

  const outcome = { status: "", steps: 0, result: "", failure: "" };
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/e2e/e2e/work-items/${taskId}`);
        if (!response.ok()) return false;
        const payload = (await response.json()) as {
          item: { status: string };
          steps: unknown[];
          activeRun: {
            resultSummary?: string | null;
            failureReason?: string | null;
          } | null;
        };
        Object.assign(outcome, {
          status: payload.item.status,
          steps: payload.steps.length,
          result: payload.activeRun?.resultSummary ?? "",
          failure: payload.activeRun?.failureReason ?? "",
        });
        return ["done", "blocked", "cancelled"].includes(payload.item.status);
      },
      { timeout: 150_000, intervals: [1_000, 2_000, 3_000] },
    )
    .toBe(true);
  expect(outcome.status, outcome.failure || "Le run réel n’a pas abouti.").toBe(
    "done",
  );
  expect(outcome.result).toContain("REAL_WORK_OK");

  const verificationPage = await context.newPage();
  await verificationPage.goto(taskUrl);
  await expect(
    verificationPage.getByRole("heading", { name: title }),
  ).toBeVisible();
  await expect(
    verificationPage.getByText("REAL_WORK_OK", { exact: false }).first(),
  ).toBeVisible();
  await expect(verificationPage.getByText(/\/2$/).first()).toBeVisible();
});
