import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import type { UI5TestOptions } from "@ahangl/playwright-ui5";

const WORKZONE_URL = process.env.WORKZONE_URL;
const FIXTURE_URL = "http://localhost:8080";

export default defineConfig<UI5TestOptions>({
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start:app",
    url: `${FIXTURE_URL}/index.html`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    // Self-tests against the local Fiori elements fixture app (mock OData service)
    {
      name: "local",
      testDir: "test/e2e",
      use: { ...devices["Desktop Chrome"], baseURL: FIXTURE_URL },
    },
    // SAP Build Work Zone: log in once, then reuse the session (opt-in, needs WORKZONE_URL + UI5_USERNAME/UI5_PASSWORD)
    {
      name: "workzone-setup",
      testDir: "test/workzone",
      testMatch: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: WORKZONE_URL },
    },
    {
      name: "workzone",
      testDir: "test/workzone",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["workzone-setup"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: WORKZONE_URL,
        storageState: ".auth/workzone.json",
      },
    },
  ],
});
