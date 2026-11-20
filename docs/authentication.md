# Authentication

Log in once in a Playwright setup project, save the session with `storageState`, and reuse it in all tests. This is faster than logging in per test and works with parallel workers.

## Configuration

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

`login({ url })` needs an absolute URL. A relative path fails right away with `playwright-ui5: login() needs an absolute url, got "site/launchpad"; build it with new URL(path, baseURL).href`. To build it from the project's `baseURL`, give the setup project a `baseURL` and use the `baseURL` fixture:

```ts
// playwright.config.ts
export default defineConfig<UI5TestOptions>({
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/, use: { baseURL: process.env.WORKZONE_URL } }
    // ... the test projects as above
  ]
});
```

```ts
// tests/auth.setup.ts
import { test as setup } from "@playwright/test";
import { login } from "@ahangl/playwright-ui5";

setup("log in", async ({ page, baseURL }) => {
  await login(page, {
    url: new URL("site/launchpad", baseURL).href, // e.g. https://example.launchpad.cfapps.eu10.hana.ondemand.com/site/launchpad
    storageStatePath: ".auth/user.json"
  });
});
```

`new URL(path, baseURL)` resolves like a link: end `baseURL` with `/` if it has a path, otherwise its last segment is replaced.

### login options

| Option             | Default                | Description                                                   |
| ------------------ | ---------------------- | ------------------------------------------------------------- |
| `url`              |                        | The Work Zone site or application to log in to.               |
| `provider`         | `ias()`                | The `AuthProvider` that performs the login.                   |
| `credentials`      | `credentialsFromEnv()` | `{ username, password }`.                                     |
| `timeout`          | `60000`                | Max. ms for the whole login.                                  |
| `storageStatePath` |                        | Where to save cookies and local storage. Omit to only log in. |

### SAP Cloud Identity Services (IAS)

`ias(options)` handles:

- Both the one-page form and the identifier-first flow (username, then password).
- The optional XSUAA IdP selection page (`idpDomain`).
- Skipping the passwordless/biometric setup prompt.
- Failing fast with the IdP's error message when credentials are wrong.
- An existing valid session: then it does nothing.

| Option                  | Default                  | Description                                                                       |
| ----------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| `idpDomain`             |                          | IdP to pick on the XSUAA selection page, e.g. `"mytenant.accounts.ondemand.com"`. |
| `usernameSelector`      | `#j_username`            | Username field.                                                                   |
| `passwordSelector`      | `#j_password`            | Password field.                                                                   |
| `submitSelector`        | `#logOnFormSubmit`       | Submit button.                                                                    |
| `errorSelector`         | IAS error elements       | Elements whose text is reported when the login fails.                             |
| `skipPasswordlessSetup` | `true`                   | Skip the "set up passwordless / biometric authentication" prompt.                 |
| `isLoggedIn`            | back on the app's origin | `(page, ctx) => boolean \| Promise<boolean>`: decides when the login is complete. |

### Custom IdP

Implement the `AuthProvider` interface:

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

### Basic Authentication

Use Playwright's built-in `httpCredentials`:

```ts
export default defineConfig({
  use: { httpCredentials: { username: process.env.UI5_USERNAME!, password: process.env.UI5_PASSWORD! } }
});
```

## Credentials

`credentialsFromEnv(prefix = "UI5")` reads `<prefix>_USERNAME` and `<prefix>_PASSWORD` and fails with a clear message if one is missing. Keep them in a git-ignored `.env` file and load it in `playwright.config.ts` with `import "dotenv/config"`. Never commit credentials.

Use a different prefix for a second user: `login(page, { url, credentials: credentialsFromEnv("ADMIN"), storageStatePath: ".auth/admin.json" })`.

MFA is not supported. Use a technical test user without MFA.
