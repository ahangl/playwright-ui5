import type { Page } from "@playwright/test";
import { ias } from "./ias";
import type { AuthProvider, Credentials } from "./types";

export { ias, type IasOptions } from "./ias";
export type { AuthProvider, Credentials, LoginContext } from "./types";

/**
 * Reads credentials from environment variables `<prefix>_USERNAME` and `<prefix>_PASSWORD`
 * (default prefix `UI5`). Load a `.env` file in your playwright.config.ts (e.g. `import "dotenv/config"`)
 * if you keep them there - never commit them.
 */
export function credentialsFromEnv(prefix = "UI5"): Credentials {
  const username = process.env[`${prefix}_USERNAME`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!username || !password) {
    throw new Error(`playwright-ui5: set ${prefix}_USERNAME and ${prefix}_PASSWORD (environment or .env file)`);
  }
  return { username, password };
}

export interface LoginOptions {
  /** URL of the Work Zone site / application to log in to. */
  url: string;
  /** Default: `ias()` */
  provider?: AuthProvider;
  /** Default: `credentialsFromEnv()` */
  credentials?: Credentials;
  /** Default: 60000 ms */
  timeout?: number;
  /**
   * Where to store cookies & local storage for reuse via Playwright's `storageState`
   * (e.g. `".auth/user.json"`). Omit to only log in.
   */
  storageStatePath?: string;
}

/**
 * Logs in and (optionally) saves the session for reuse. Use it in a Playwright setup project:
 *
 * @example
 * // auth.setup.ts
 * import { test as setup } from "@playwright/test";
 * import { login, ias } from "@ahangl/playwright-ui5";
 * setup("authenticate", async ({ page }) => {
 *   await login(page, { url: process.env.WORKZONE_URL!, provider: ias(), storageStatePath: ".auth/user.json" });
 * });
 */
export async function login(page: Page, options: LoginOptions): Promise<void> {
  const provider = options.provider ?? ias();
  await provider.login(page, {
    url: options.url,
    credentials: options.credentials ?? credentialsFromEnv(),
    timeout: options.timeout ?? 60_000
  });
  if (options.storageStatePath) {
    await page.context().storageState({ path: options.storageStatePath });
  }
}
