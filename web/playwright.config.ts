import { defineConfig } from "@playwright/test";

// Offline smoke test of the main path: the API replays recorded Gemini responses
// (LLM_FIXTURE) and the web app runs in dev mode against it. No network, no quota.
const API_PORT = 8010;
const WEB_PORT = 3010;
// Fresh per run; the API creates it (deleting it under a running server breaks SQLite).
const DATA_DIR = `/tmp/drop2list-e2e-${Date.now()}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    // System Chrome: avoids downloading Playwright's browsers.
    channel: "chrome",
    trace: "retain-on-failure",
  },
  globalSetup: "./e2e/global-setup.ts",
  webServer: [
    {
      command: `.venv/bin/uvicorn app.main:app --port ${API_PORT}`,
      cwd: "../api",
      url: `http://localhost:${API_PORT}/api/health`,
      env: {
        LLM_FIXTURE: "tests/fixtures/llm_math_tutor.json",
        TRANSCRIBE_BACKEND: "gemini",
        LLM_CACHE: "0",
        DATA_DIR,
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm exec next dev -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      env: { NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
