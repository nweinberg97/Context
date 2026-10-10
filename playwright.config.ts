import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run a production build against a disposable local database, with
 * the rule-based extractor (no paid API calls) and the email outbox provider.
 * E2E_DATABASE_URL must point at a database the suite may reset.
 */
const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${port}`;
const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:54322/context_e2e";

const env = {
  NODE_ENV: "production",
  APP_URL: baseURL,
  DATABASE_URL: databaseUrl,
  CONTEXT_ALLOW_LOCAL_AUTH: "true",
  LOCAL_AUTH_SECRET: "e2e-local-auth-secret-0123456789abcdef",
  EXTRACTION_PROVIDER: "rules",
  EMAIL_PROVIDER: "outbox",
  CRON_SECRET: "e2e-cron-secret-0123456789",
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${port}`,
    url: baseURL,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env,
  },
});
