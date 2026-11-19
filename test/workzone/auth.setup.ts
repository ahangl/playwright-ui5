import { test as setup } from "@playwright/test";
import { ias, login } from "@ahangl/playwright-ui5";

/**
 * Logs in to SAP Build Work Zone once and stores the session in .auth/workzone.json.
 * The `workzone` project reuses it via `storageState` (see playwright.config.ts).
 */
setup.skip(!process.env.WORKZONE_URL, "WORKZONE_URL is not set");

setup("log in to SAP Build Work Zone", async ({ page }) => {
  await login(page, {
    url: process.env.WORKZONE_URL!,
    provider: ias({ idpDomain: process.env.WORKZONE_IDP || undefined }),
    storageStatePath: ".auth/workzone.json",
  });
});
