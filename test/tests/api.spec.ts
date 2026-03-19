/**
 * API auth guard tests — direct API calls
 *
 * Scenario's:
 * 1. GET /api/health → 200
 * 2. POST /api/chat zonder token → 401
 * 3. POST /api/chat met geldig token → 200 + mock-antwoord (LLM_MOCK)
 */
import { test, expect } from "@playwright/test";
import { getAdminCreds } from "./helpers";

test("GET /api/health geeft 200 terug", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
});

test("POST /api/chat zonder token geeft 401", async ({ request }) => {
  const res = await request.post("/api/chat", {
    data: { messages: [{ role: "user", content: "hallo" }] },
  });
  expect(res.status()).toBe(401);
});

test("POST /api/chat met geldig token geeft 200 + mock-antwoord", async ({ request }) => {
  const { token } = getAdminCreds();

  const res = await request.post("/api/chat", {
    headers: { Authorization: `Bearer ${token}` },
    data: { messages: [{ role: "user", content: "hallo" }] },
  });

  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.message).toContain("LLM_MOCK");
  expect(body.action).toBe("none");
});
