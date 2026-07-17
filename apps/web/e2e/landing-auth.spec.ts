import { expect, test } from "@playwright/test";
import { loginE2E } from "./hermes-mock";

test("keeps public landing calls to action on the login flow", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Se connecter" })).toHaveAttribute(
    "href",
    "/login",
  );

  const consoleLinks = page.getByRole("link", { name: "Ouvrir la console" });
  await expect(consoleLinks).toHaveCount(3);
  for (const link of await consoleLinks.all()) {
    await expect(link).toHaveAttribute("href", "/login");
  }
});

test("prefills each Atelier Lumière demo role from the login page", async ({ page }) => {
  await page.goto("/login");

  const email = page.getByLabel("Email");
  const password = page.getByLabel("Mot de passe");

  for (const account of [
    { name: "Alice Owner", email: "owner@atelier-lumiere.local" },
    { name: "Marc Member", email: "member@atelier-lumiere.local" },
    { name: "Violette Viewer", email: "viewer@atelier-lumiere.local" },
  ]) {
    const selector = page.getByRole("button", { name: new RegExp(account.name) });
    await selector.click();
    await expect(selector).toHaveAttribute("aria-pressed", "true");
    await expect(email).toHaveValue(account.email);
    await expect(password).toHaveValue("demo-password");
  }
});

test("sends an authenticated user from the landing to their dashboard", async ({ page }) => {
  await loginE2E(page);
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Se connecter" })).toHaveCount(0);

  const consoleLinks = page.getByRole("link", { name: "Ouvrir ma console" });
  await expect(consoleLinks).toHaveCount(3);
  for (const link of await consoleLinks.all()) {
    await expect(link).toHaveAttribute("href", "/e2e/dashboard");
  }

  await consoleLinks.first().click();
  await expect(page).toHaveURL(/\/e2e\/dashboard$/);
});

test("redirects an authenticated visit to login straight to the dashboard", async ({ page }) => {
  await loginE2E(page);
  await page.goto("/login");

  await expect(page).toHaveURL(/\/e2e\/dashboard$/);
});
