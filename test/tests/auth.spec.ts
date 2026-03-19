/**
 * Auth flow tests — UI level
 *
 * De admin-gebruiker wordt aangemaakt via globalSetup (eerste gebruiker = admin).
 * Alle overige registraties in deze tests worden pending.
 */
import { test, expect, Page } from "@playwright/test";
import { uniqueEmail, getAdminCreds } from "./helpers";

const PASSWORD = "testWachtwoord1";

async function fillLoginForm(page: Page, email: string, password: string) {
  await page.getByPlaceholder("naam@voorbeeld.nl").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
}

async function fillRegisterForm(
  page: Page,
  name: string,
  email: string,
  password: string
) {
  await page.getByRole("button", { name: "Aanmelden" }).click();
  await page.getByPlaceholder("Jan de Boer").fill(name);
  await page.getByPlaceholder("naam@voorbeeld.nl").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
}

test("landingspagina toont login-formulier bij eerste bezoek", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Inloggen" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Aanmelden" })).toBeVisible();
  await expect(page.getByText("kampeerhub")).toBeVisible();
});

test("admin kan inloggen en ziet de app", async ({ page }) => {
  const { email, password } = getAdminCreds();

  await page.goto("/");
  await fillLoginForm(page, email, password);
  await page.getByRole("button", { name: "Inloggen" }).last().click();

  await expect(page.getByRole("button", { name: "uitloggen" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("camping zoeker")).toBeVisible();
});

test("tweede gebruiker ziet goedkeuringsbericht na registratie", async ({ page }) => {
  const pendingEmail = uniqueEmail("pending");

  await page.goto("/");
  await fillRegisterForm(page, "Wachtende Gebruiker", pendingEmail, PASSWORD);
  await page.getByRole("button", { name: "Account aanmaken" }).click();

  await expect(page.getByText("wacht op goedkeuring")).toBeVisible({ timeout: 5_000 });
});

test("login met verkeerd wachtwoord toont foutmelding", async ({ page }) => {
  const { email } = getAdminCreds();

  await page.goto("/");
  await fillLoginForm(page, email, "verkeerd_wachtwoord");
  await page.getByRole("button", { name: "Inloggen" }).last().click();

  await expect(page.getByText(/mislukt|fout|onjuist/i)).toBeVisible({ timeout: 5_000 });
});

test("uitloggen brengt gebruiker terug naar landingspagina", async ({ page }) => {
  const { email, password } = getAdminCreds();

  await page.goto("/");
  await fillLoginForm(page, email, password);
  await page.getByRole("button", { name: "Inloggen" }).last().click();

  await expect(page.getByRole("button", { name: "uitloggen" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "uitloggen" }).click();

  await expect(page.getByRole("button", { name: "Aanmelden" })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("vind jouw perfecte camping")).toBeVisible();
});
