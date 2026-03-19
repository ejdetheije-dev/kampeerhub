/**
 * Admin flow tests
 *
 * Scenario's:
 * 1. Admin ziet gebruikerstabel op /admin
 * 2. Admin keurt pending gebruiker goed → die kan nu inloggen
 * 3. Niet-admin krijgt "Geen toegang" op /admin
 */
import { test, expect, Page } from "@playwright/test";
import { uniqueEmail, getAdminCreds, apiRegister, apiLogin } from "./helpers";

const PASSWORD = "testWachtwoord1";

async function openAdminPage(page: Page, token: string) {
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("authToken", t);
    localStorage.setItem("isAdmin", "true");
  }, token);
  await page.goto("/admin");
  await expect(page.getByText("gebruikersbeheer")).toBeVisible({ timeout: 5_000 });
}

test("admin ziet gebruikerstabel op /admin", async ({ page }) => {
  const { token } = getAdminCreds();
  await openAdminPage(page, token);

  await expect(page.getByRole("columnheader", { name: "Naam" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Toegang" })).toBeVisible();
});

test("admin keurt pending gebruiker goed via checkbox", async ({ page, request }) => {
  const { token } = getAdminCreds();

  // Registreer een nieuwe pending gebruiker
  const pendingEmail = uniqueEmail("goed_te_keuren");
  const pendingName = `Pending_${Date.now()}`;
  await apiRegister(request, pendingEmail, PASSWORD, pendingName);

  // Open admin-pagina en zoek de rij via naam-cel
  await openAdminPage(page, token);

  // Gebruik row-locator op basis van cel-inhoud (betrouwbaarder dan row name)
  const row = page.locator("tr", { has: page.getByRole("cell", { name: pendingName }) });
  const checkbox = row.getByRole("checkbox");
  await expect(checkbox).not.toBeChecked({ timeout: 5_000 });
  await checkbox.click();
  await expect(checkbox).toBeChecked({ timeout: 5_000 });

  // Pending gebruiker kan nu inloggen
  const { status } = await apiLogin(request, pendingEmail, PASSWORD);
  expect(status).toBe(200);
});

test("niet-admin ziet geen toegang op /admin", async ({ page }) => {
  await page.goto("/");
  // Geen authToken in localStorage → adminPage toont "Geen toegang"
  await page.goto("/admin");
  await expect(page.getByText("Geen toegang")).toBeVisible({ timeout: 5_000 });
});
