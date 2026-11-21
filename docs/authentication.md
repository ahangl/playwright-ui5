---
description: "Log in to SAP Build Work Zone with SAP IAS once in a setup project and reuse the session in all tests."
---

# Authentication

Log in once in a Playwright setup project, save the session with `storageState`, and reuse it in all tests. This is faster than logging in per test and works with parallel workers.

## Setup project

```ts
// tests/auth.setup.ts
import { test as setup } from "@playwright/test";
import { ias, login } from "@ahangl/playwright-ui5";

setup("log in", async ({ page }) => {
  await login(page, {
    url: process.env.WORKZONE_URL!,
    provider: ias({ idpDomain: process.env.WORKZONE_IDP }), // idpDomain only if XSUAA shows an IdP selection
    storageStatePath: ".auth/user.json"
  });
});
```

```ts
// playwright.config.ts
import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import type { UI5TestOptions } from "@ahangl/playwright-ui5";

export default defineConfig<UI5TestOptions>({
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "workzone",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], baseURL: process.env.WORKZONE_URL, storageState: ".auth/user.json" }
    }
  ]
});
```

Add `.auth/` to `.gitignore`.

### Absolute URL

`login()` needs an absolute URL. To build it from a path, give the setup project a `baseURL` (`use: { baseURL: process.env.WORKZONE_URL }`) and use the `baseURL` fixture:

```ts
setup("log in", async ({ page, baseURL }) => {
  await login(page, { url: new URL("site/launchpad", baseURL).href, storageStatePath: ".auth/user.json" });
});
```

`new URL(path, baseURL)` resolves like a link: end `baseURL` with `/` if it has a path, otherwise its last segment is replaced.

## login()

```ts
login(page: Page, options: LoginOptions): Promise<void>
```

Opens `url`, logs in with the provider and, with `storageStatePath`, saves cookies and local storage for Playwright's `storageState`.

| Option             | Default                                | Description                                                                             |
| ------------------ | -------------------------------------- | --------------------------------------------------------------------------------------- |
| `url`              | (required)                             | Absolute URL of the Work Zone site or app. Build it with `new URL(path, baseURL).href`. |
| `provider`         | `ias()`                                | The [`AuthProvider`](#custom-idp) that performs the login.                              |
| `credentials`      | [`credentialsFromEnv()`](#credentials) | `{ username, password }`.                                                               |
| `timeout`          | `60000`                                | Max. ms for the whole login.                                                            |
| `storageStatePath` |                                        | Where to save the session, e.g. `".auth/user.json"`. Omit to only log in.               |

A relative `url` fails right away with `playwright-ui5: login() needs an absolute url, got "..."`.

## SAP Cloud Identity Services (IAS)

```ts
ias(options?: IasOptions): AuthProvider
```

`ias(options)` handles:

- Both the one-page form and the identifier-first flow (username, then password).
- The optional XSUAA IdP selection page (`idpDomain`).
- Skipping the passwordless/biometric setup prompt.
- Failing fast with the IdP's error message when credentials are wrong.
- An existing valid session: it opens the URL and skips the form.

| Option                  | Default                  | Description                                                                       |
| ----------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| `idpDomain`             |                          | IdP to pick on the XSUAA selection page, e.g. `"mytenant.accounts.ondemand.com"`. |
| `usernameSelector`      | `#j_username`            | Username field.                                                                   |
| `passwordSelector`      | `#j_password`            | Password field.                                                                   |
| `submitSelector`        | `#logOnFormSubmit`       | Submit button.                                                                    |
| `errorSelector`         | IAS error elements       | Elements whose text is reported when the login fails.                             |
| `skipPasswordlessSetup` | `true`                   | Skip the "set up passwordless / biometric authentication" prompt.                 |
| `isLoggedIn`            | back on the app's origin | `(page, ctx) => boolean \| Promise<boolean>`: decides when the login is complete. |

```ts
await login(page, { url, provider: ias({ idpDomain: "mytenant.accounts.ondemand.com" }) });
```

MFA is not supported. Use a technical test user without MFA.

## Custom IdP

Implement the `AuthProvider` interface and pass it as `provider`:

```ts
interface AuthProvider {
  readonly name: string;
  login(page: Page, ctx: LoginContext): Promise<void>;
}

interface LoginContext {
  url: string; // the absolute url passed to login()
  credentials: Credentials; // { username: string; password: string }
  timeout: number; // max. ms for the whole login
}
```

Its `login()` opens `ctx.url`, logs in, and resolves once the browser is back on the app. `name` is a label for your own use. Example:

```ts
import type { AuthProvider } from "@ahangl/playwright-ui5";

export const myIdp: AuthProvider = {
  name: "my-idp",
  async login(page, { url, credentials, timeout }) {
    await page.goto(url);
    await page.getByLabel("User").fill(credentials.username);
    await page.getByLabel("Password").fill(credentials.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => u.origin === new URL(url).origin, { timeout });
  }
};
```

## Basic Authentication

Use Playwright's built-in `httpCredentials`:

```ts
export default defineConfig({
  use: { httpCredentials: { username: process.env.UI5_USERNAME!, password: process.env.UI5_PASSWORD! } }
});
```

## Credentials

```ts
credentialsFromEnv(prefix?: string): Credentials
```

`credentialsFromEnv()` reads `<prefix>_USERNAME` (default prefix `UI5`) and `<prefix>_PASSWORD` and fails with a clear message if one is missing. Keep them in a git-ignored `.env` file and load it in `playwright.config.ts` with `import "dotenv/config"`. Never commit credentials.

Use a different prefix for a second user: `login(page, { url, credentials: credentialsFromEnv("ADMIN"), storageStatePath: ".auth/admin.json" })`.
