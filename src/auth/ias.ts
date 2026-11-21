import type { Page } from "@playwright/test";
import type { AuthProvider, LoginContext } from "./types";

export interface IasOptions {
  /**
   * If the XSUAA login page offers several identity providers, the IdP to pick
   * (clicks `a[href*="idp=<idpDomain>"]`), for example, `"mytenant.accounts.ondemand.com"`.
   */
  idpDomain?: string;
  /** Default: `#j_username` */
  usernameSelector?: string;
  /** Default: `#j_password` */
  passwordSelector?: string;
  /** Default: `#logOnFormSubmit` */
  submitSelector?: string;
  /** Elements that show login errors (read for the error message). */
  errorSelector?: string;
  /**
   * Skip the "set up passwordless / biometric authentication" interstitial of SAP IAS by setting
   * its opt-out cookie. Default: `true`.
   */
  skipPasswordlessSetup?: boolean;
  /**
   * Decides when the login is complete. Default: the browser is back on the origin of the
   * requested URL.
   */
  isLoggedIn?: (page: Page, ctx: LoginContext) => boolean | Promise<boolean>;
}

const DEFAULTS = {
  usernameSelector: "#j_username",
  passwordSelector: "#j_password",
  submitSelector: "#logOnFormSubmit",
  errorSelector: "#logOnFormErrorMessage, .sapUiErrorMessage, [role='alert'], .error-message"
};

const PASSWORDLESS_COOKIE = "__HOST-skipPasswordlessAuthnDeviceConfig";

/**
 * Login via SAP Cloud Identity Services - Identity Authentication (IAS), optionally behind the
 * XSUAA IdP selection page. Supports the classic one-page form (username + password) and the
 * identifier-first flow (username, continue, password). MFA is not supported.
 */
export function ias(options: IasOptions = {}): AuthProvider {
  const sel = { ...DEFAULTS, ...options };
  const skipPasswordless = options.skipPasswordlessSetup ?? true;

  return {
    name: "ias",
    async login(page, ctx) {
      const appOrigin = new URL(ctx.url).origin;
      const deadline = Date.now() + ctx.timeout;
      const remaining = () => Math.max(deadline - Date.now(), 1_000);
      const loggedIn = async () =>
        options.isLoggedIn ? options.isLoggedIn(page, ctx) : new URL(page.url()).origin === appOrigin;

      await page.goto(ctx.url);

      const username = page.locator(sel.usernameSelector);
      const password = page.locator(sel.passwordSelector);
      const submit = page.locator(sel.submitSelector);
      const idpLink = options.idpDomain ? page.locator(`a[href*="idp=${options.idpDomain}"]`) : undefined;

      // Wait for: login form, IdP selection, or already logged in (valid session).
      const first = await Promise.race([
        username.waitFor({ timeout: remaining() }).then(() => "form" as const),
        idpLink
          ?.first()
          .waitFor({ timeout: remaining() })
          .then(() => "idp" as const) ?? new Promise<never>(() => {}),
        page
          .waitForURL((u) => u.origin === appOrigin, { timeout: remaining() })
          .then(async () => ((await username.isVisible()) ? ("form" as const) : ("app" as const)))
      ]).catch(() => "timeout" as const);

      if (first === "app" && (await loggedIn())) return;
      if (first === "timeout") {
        throw new Error(`playwright-ui5 (ias): neither a login form nor the application appeared for ${ctx.url}`);
      }
      if (first === "idp") {
        await idpLink!.first().click();
        await username.waitFor({ timeout: remaining() });
      }

      if (skipPasswordless) {
        const loginOrigin = new URL(page.url()).origin;
        await page
          .context()
          .addCookies([{ name: PASSWORDLESS_COOKIE, value: "true", url: loginOrigin, secure: true, path: "/" }])
          .catch(() => undefined);
      }

      await username.fill(ctx.credentials.username);
      if (!(await password.isVisible())) {
        // identifier-first flow: submit the username, then the password page appears
        await submit.click();
        await password.waitFor({ timeout: remaining() });
      }
      await password.fill(ctx.credentials.password);
      await submit.click();

      try {
        // Back on the app - or the IdP shows an error (wrong password, locked user): fail fast.
        const outcome = await Promise.race([
          page.waitForURL((u) => u.origin === appOrigin, { timeout: remaining() }).then(() => "app" as const),
          page
            .locator(sel.errorSelector)
            .filter({ hasText: /\S/ })
            .first()
            .waitFor({ state: "visible", timeout: remaining() })
            .then(() => "error" as const)
        ]);
        if (outcome === "error") throw new Error("the identity provider reported an error");
        if (options.isLoggedIn) {
          while (!(await options.isLoggedIn(page, ctx))) {
            if (Date.now() > deadline) throw new Error("isLoggedIn() did not become true");
            await page.waitForTimeout(250);
          }
        }
      } catch (e) {
        const errors = await page
          .locator(sel.errorSelector)
          .allInnerTexts()
          .catch(() => [] as string[]);
        const detail = errors
          .map((t) => t.trim())
          .filter(Boolean)
          .join(" | ");
        throw new Error(
          `playwright-ui5 (ias): login as '${ctx.credentials.username}' did not complete` +
            (detail ? `: ${detail}` : ` (still on ${page.url()})`) +
            `\n${(e as Error).message}`,
          { cause: e }
        );
      }
    }
  };
}
