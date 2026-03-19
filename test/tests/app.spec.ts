/**
 * Core app tests — na inloggen
 *
 * Scenario's:
 * 1. Na inloggen verschijnt de kaart en lijst
 * 2. Chat toont initieel begroetingsbericht
 * 3. Chat: bericht sturen → mock-antwoord verschijnt
 */
import { test, expect, Page } from "@playwright/test";
import { getAdminCreds } from "./helpers";

async function loginViaLocalStorage(page: Page, token: string) {
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("authToken", t);
    localStorage.setItem("isAdmin", "true");
    localStorage.setItem("userName", "Test Admin");
  }, token);
  await page.reload();
}

test.describe("App na inloggen", () => {
  test("header, kaart en lijst zijn zichtbaar", async ({ page }) => {
    const { token } = getAdminCreds();
    await loginViaLocalStorage(page, token);

    await expect(page.getByText("camping zoeker")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "uitloggen" })).toBeVisible();
  });

  test("chat toont initieel begroetingsbericht", async ({ page }) => {
    const { token } = getAdminCreds();
    await loginViaLocalStorage(page, token);

    await expect(
      page.getByText("Hallo! Ik ben kampeerhub. Waar wil je naartoe kamperen?")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("chat: bericht sturen geeft mock-antwoord terug", async ({ page }) => {
    const { token } = getAdminCreds();
    await loginViaLocalStorage(page, token);

    const input = page.getByPlaceholder("Stel een vraag...");
    await expect(input).toBeVisible({ timeout: 5_000 });

    await input.fill("Welke campings zijn er in Normandië?");
    await page.getByRole("button", { name: "Stuur" }).click();

    // Mock-antwoord: "Dit is een testantwoord. LLM_MOCK is ingeschakeld."
    await expect(page.getByText(/LLM_MOCK/)).toBeVisible({ timeout: 15_000 });
  });
});
