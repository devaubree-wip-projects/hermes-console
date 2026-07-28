import { expect, test } from "@playwright/test";
import { loginE2E } from "./hermes-mock";

// La landing s'adresse à un prospect qui ne connaît pas le produit : ses appels à
// l'action mènent au prix et à la prise de contact, pas à une console dont il
// n'a pas le compte. Seuls les liens de connexion restent, et ils doivent tous
// tomber sur /login.
test("keeps public landing calls to action on the login flow", async ({ page }) => {
  await page.goto("/");

  const loginLinks = page.getByRole("link", { name: "Se connecter" });
  await expect(loginLinks).toHaveCount(2);
  const consoleLinks = page.getByRole("link", { name: "Ouvrir la console" });
  await expect(consoleLinks).toHaveCount(1);

  for (const link of [...(await loginLinks.all()), ...(await consoleLinks.all())]) {
    await expect(link).toHaveAttribute("href", "/login");
  }
});

test("puts the price one click away for an anonymous visitor", async ({ page }) => {
  await page.goto("/");

  // Le prix est la première question d'un prospect : il doit être atteignable
  // depuis le hero, y compris sur mobile où la navigation d'en-tête disparaît.
  await expect(page.getByRole("heading", { name: /Un prix, annoncé/ })).toBeAttached();
  await page.getByRole("link", { name: "Voir les tarifs" }).first().click();
  await expect(page).toHaveURL(/#tarifs$/);
});

test("prefills each demo role from the login page", async ({ page }) => {
  await page.goto("/login");

  const email = page.getByLabel("Email");
  const password = page.getByLabel("Mot de passe");

  for (const account of [
    { name: "Alice Owner", email: "owner@atelier-lumiere.local" },
    { name: "Marc Member", email: "member@atelier-lumiere.local" },
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
