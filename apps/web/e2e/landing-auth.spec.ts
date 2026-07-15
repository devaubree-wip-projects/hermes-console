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

test("sends an authenticated user from the landing to their dashboard", async ({ page }) => {
  await loginE2E(page);
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Se connecter" })).toHaveCount(0);

  const consoleLinks = page.getByRole("link", { name: "Ouvrir ma console" });
  await expect(consoleLinks).toHaveCount(3);
  for (const link of await consoleLinks.all()) {
    await expect(link).toHaveAttribute("href", "/e2e/e2e/dashboard");
  }

  await consoleLinks.first().click();
  await expect(page).toHaveURL(/\/e2e\/e2e\/dashboard$/);
});

test("redirects an authenticated visit to login straight to the dashboard", async ({ page }) => {
  await loginE2E(page);
  await page.goto("/login");

  await expect(page).toHaveURL(/\/e2e\/e2e\/dashboard$/);
});
