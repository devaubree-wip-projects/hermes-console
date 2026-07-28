import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginE2E } from "./hermes-mock";

test("lists the local runtime and connects an existing Edge", async ({ page }) => {
  await loginE2E(page);
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/e2e/installations/preflight", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        preflight: {
          status: "ready",
          statusDetail: null,
          hermesVersion: "2026.7.7.2",
          runtimeKind: "docker",
          lifecycle: ["start", "restart"],
          profiles: [{ name: "default", provider: "openai", model: "gpt-test" }],
        },
      }),
    });
  });
  await page.route("**/api/e2e/installations", async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ installation: { id: "remote-e2e" } }),
    });
  });

  await page.goto("/e2e/installations");
  await expect(page.getByRole("heading", { name: "Installations Hermes" })).toBeVisible();
  await expect(page.getByTestId("installations-content").getByRole("link", { name: "Hermes E2E", exact: true })).toBeVisible();
  await expect(page.getByText("http://127.0.0.1:8787", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Ajouter une installation" }).click();
  // « Enrôler » est l'onglet par défaut depuis que l'enrôlement donne un secret
  // propre à l'installation ; ce test couvre le chemin hérité, il faut donc
  // demander « Connecter » explicitement.
  await page.getByRole("tab", { name: "Connecter" }).click();
  await page.locator("#installation-name").fill("VPS production");
  await page.getByLabel("URL publique du Edge").fill("https://edge.example.com");
  await page.locator("#installation-key").fill("vps-production");
  await page.getByRole("button", { name: "Tester le Edge" }).click();
  await expect(page.getByTestId("installation-preflight")).toContainText("Hermes 2026.7.7.2");
  await expect(page.getByLabel("Profil Hermes découvert")).toContainText("default");
  await page.getByLabel("Niveau de gestion").click();
  await page.getByRole("option", { name: "Connectée — configurer et redémarrer" }).click();
  await page.getByRole("button", { name: "Connecter l’installation" }).click();

  // The success message renders both inline (role="status") and as a toast;
  // scope to the dialog to target the deterministic inline confirmation.
  await expect(page.getByRole("dialog").getByText("Installation Hermes connectée.")).toBeVisible();
  expect(submitted).toMatchObject({
    name: "VPS production",
    gatewayUrl: "https://edge.example.com",
    installationKey: "vps-production",
    profileName: "default",
    managementLevel: "connected",
  });
  const accessibility = await new AxeBuilder({ page })
    .include('[data-testid="installations-content"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("filters tenant installations to those used by the current organization", async ({ page }) => {
  await loginE2E(page);
  await page.goto("/e2e/installations");
  await expect(page.getByRole("link", { name: "Hermes sans agent", exact: true })).toBeVisible();
  await page.getByLabel("Filtrer par organisation").selectOption("current");
  await page.getByRole("button", { name: "Filtrer" }).click();
  await expect(page).toHaveURL(/workspace=current/);
  await expect(page.getByRole("link", { name: "Hermes E2E", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Hermes sans agent", exact: true })).toHaveCount(0);
});

test("manages an installation from its tenant-scoped detail page", async ({ page }) => {
  await loginE2E(page);
  const mutations: Array<Record<string, unknown>> = [];
  let lifecycleOperation: Record<string, unknown> | null = null;
  await page.route("**/api/e2e/installations/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    mutations.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ installation: { id: "local-e2e" } }),
    });
  });
  await page.route("**/api/e2e/installations/*/operations", async (route) => {
    lifecycleOperation = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ operation: { id: "operation-e2e", status: "succeeded" } }),
    });
  });

  await page.goto("/e2e/installations");
  await page.getByTestId("installations-content").getByRole("link", { name: "Hermes E2E", exact: true }).click();
  await expect(page.getByTestId("installation-detail").locator("h1")).toHaveText("Hermes E2E");
  await expect(page.getByText(/Hermes : 2026\.7\.7\.2/)).toBeVisible();
  await expect(page.getByRole("tab", { name: "Sécurité" })).toBeVisible();

  const installationId = new URL(page.url()).pathname.split("/").at(-1);
  const unconfirmed = await page.request.post(`/api/e2e/installations/${installationId}/operations`, {
    data: { type: "restart", profile: "default" },
  });
  expect(unconfirmed.status()).toBe(400);
  await expect(unconfirmed.json()).resolves.toMatchObject({ error: expect.stringContaining("Confirmation") });

  await page.getByRole("tab", { name: "Opérations" }).click();
  await page.getByRole("button", { name: "Redémarrer" }).click();
  expect(lifecycleOperation).toBeNull();
  await page.getByRole("button", { name: "Confirmer le redémarrage" }).click();
  await expect.poll(() => lifecycleOperation).toMatchObject({ type: "restart", profile: "default", confirmed: true });

  await page.getByLabel("Nom").fill("Hermes local renommé");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(() => mutations.some((body) => body.name === "Hermes local renommé")).toBe(true);

  await page.getByRole("button", { name: "Associer", exact: true }).click();
  await expect.poll(() => mutations.some((body) => body.profileName === "default")).toBe(true);

  // The preceding success toasts stack bottom-right over the destructive
  // action; Playwright's hover pauses their auto-dismiss. Make the toast layer
  // click-through (no DOM removal, so React reconciliation stays intact).
  await page.addStyleTag({
    content: "[data-sonner-toaster], [data-sonner-toast] { pointer-events: none !important; }",
  });
  await page.getByRole("button", { name: "Déconnecter" }).click();
  await page.getByRole("button", { name: "Confirmer" }).click();
  await expect.poll(() => mutations.some((body) => body.archived === true)).toBe(true);

  const accessibility = await new AxeBuilder({ page })
    .include('[data-testid="installation-detail"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("never exposes or mutates an installation from another tenant", async ({ page }) => {
  await loginE2E(page);
  const installationId = "00000000-0000-4000-8000-000000000002";
  const pageResponse = await page.goto(`/isolated/isolated/installations/${installationId}`);
  expect(pageResponse?.status()).toBe(404);
  await expect(page.getByText("Hermes secret tenant B")).toHaveCount(0);

  const apiResponse = await page.request.patch(
    `/api/isolated/isolated/installations/${installationId}`,
    { data: { name: "Tentative tenant A" } },
  );
  expect(apiResponse.status()).toBe(404);
});

test("creates a one-time Relay enrollment command without exposing the token twice", async ({ page }) => {
  await loginE2E(page);
  let requestBody: Record<string, unknown> | null = null;
  await page.route("**/api/e2e/installations/enroll", async (route) => {
    requestBody = await route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        installation: { id: "relay-installation" },
        enrollment: {
          token: "one-time-enrollment-secret",
          expiresAt: "2026-07-15T13:00:00.000Z",
          exchangeUrl: "https://console.example.test/api/runtime/enroll",
          relayUrl: "wss://relay.example.test/v1/relay/connect",
        },
      }),
    });
  });
  await page.goto("/e2e/installations");
  // The Relay enrollment form lives under the "Enrôler" tab of the add dialog.
  await page.getByRole("button", { name: "Ajouter une installation" }).click();
  await page.getByRole("tab", { name: "Enrôler" }).click();
  await page.locator("#relay-installation-name").fill("VPS Relay");
  await page.locator("#relay-installation-key").fill("vps-relay");
  await page.getByRole("button", { name: "Générer le jeton court" }).click();
  await expect(page.getByTestId("relay-enrollment-result")).toBeVisible();
  await expect(page.locator("#enrollment-command")).toHaveValue(/hermes-gateway enroll.*one-time-enrollment-secret/);
  await expect(page.getByText("Jeton affiché une seule fois")).toBeVisible();
  // L'égalité reste stricte à dessein : elle garantit qu'aucun champ supplémentaire
  // ne fuite dans le corps. `transport` a été ajouté quand le Edge a pu écouter sur
  // sa propre URL — ce formulaire reste celui du Relay.
  expect(requestBody).toEqual({ name: "VPS Relay", installationKey: "vps-relay", transport: "relay" });
});
