import { APIRequestContext } from "@playwright/test";
import * as fs from "fs";
import { AUTH_STATE_PATH } from "./globalSetup";

export function uniqueEmail(prefix: string): string {
  return `${prefix}_${Date.now()}@test.nl`;
}

export function getAdminCreds(): {
  email: string;
  password: string;
  name: string;
  token: string;
} {
  return JSON.parse(fs.readFileSync(AUTH_STATE_PATH, "utf-8"));
}

export async function apiRegister(
  request: APIRequestContext,
  email: string,
  password: string,
  name: string
) {
  const res = await request.post("/api/auth/register", {
    data: { email, password, name },
  });
  return { status: res.status(), body: await res.json() };
}

export async function apiLogin(
  request: APIRequestContext,
  email: string,
  password: string
) {
  const res = await request.post("/api/auth/login", {
    data: { email, password },
  });
  return { status: res.status(), body: await res.json() };
}
