import { FullConfig } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

export const ADMIN = {
  email: "admin@kampeerhub.test",
  password: "AdminWachtwoord1",
  name: "Test Admin",
};

export const AUTH_STATE_PATH = path.join(__dirname, ".auth-state.json");

async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0].use.baseURL ?? "http://localhost:8001";

  // Register admin — first user in a fresh DB becomes admin + auto-approved
  const regRes = await fetch(`${baseURL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ADMIN),
  });

  if (!regRes.ok) {
    const err = await regRes.json().catch(() => ({}));
    throw new Error(`Admin registratie mislukt: ${JSON.stringify(err)}`);
  }

  // Login to get session token
  const loginRes = await fetch(`${baseURL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
  });

  const loginData = await loginRes.json();
  if (!loginRes.ok) {
    throw new Error(`Admin login mislukt: ${JSON.stringify(loginData)}`);
  }

  fs.writeFileSync(
    AUTH_STATE_PATH,
    JSON.stringify({ ...ADMIN, token: loginData.token })
  );
}

export default globalSetup;
