import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/globalSetup.ts",
  use: {
    baseURL: "http://localhost:8001",
    storageState: undefined,
  },
  // Sequential: globalSetup creates the admin user once, tests share that DB state
  workers: 1,
});
