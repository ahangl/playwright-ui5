# Authentication API

Functions to log in to SAP Build Work Zone (or any app behind SAP IAS) in a Playwright setup project and save the session for reuse.

```ts
import { login, ias } from "@ahangl/playwright-ui5";

await login(page, { url: process.env.WORKZONE_URL!, provider: ias(), storageStatePath: ".auth/user.json" });
```

[Learn more: Authentication](../authentication)

## login()

```ts
login(page: Page, options: LoginOptions): Promise<void>
```

Opens `url`, logs in with the provider and, with `storageStatePath`, saves cookies and local storage for Playwright's `storageState`.

| Option             | Default                                       | Description                                                                             |
| ------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| `url`              | (required)                                    | Absolute URL of the Work Zone site or app. Build it with `new URL(path, baseURL).href`. |
| `provider`         | `ias()`                                       | The [`AuthProvider`](#authprovider) that performs the login.                            |
| `credentials`      | [`credentialsFromEnv()`](#credentialsfromenv) | `{ username, password }`.                                                               |
| `timeout`          | `60000`                                       | Max. ms for the whole login.                                                            |
| `storageStatePath` |                                               | Where to save the session, e.g. `".auth/user.json"`. Omit to only log in.               |

A relative `url` fails right away with `playwright-ui5: login() needs an absolute url, got "..."`.

## ias()

```ts
ias(options?: IasOptions): AuthProvider
```

The login provider for SAP Cloud Identity Services - Identity Authentication (IAS). It handles the one-page form and the identifier-first flow (username, then password), the optional XSUAA IdP selection page and the passwordless setup prompt. With wrong credentials it fails fast with the IdP's error message. If the session is still valid, it does nothing. MFA is not supported.

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

## credentialsFromEnv()

```ts
credentialsFromEnv(prefix?: string): Credentials
```

Reads `<prefix>_USERNAME` and `<prefix>_PASSWORD` from the environment (default prefix `UI5`) and fails with a clear message if one is missing. Load a `.env` file in `playwright.config.ts` with `import "dotenv/config"`.

```ts
await login(page, { url, credentials: credentialsFromEnv("ADMIN"), storageStatePath: ".auth/admin.json" });
```

## AuthProvider

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

Implement it for another identity provider and pass it as `provider`. Its `login()` opens `ctx.url`, logs in, and resolves once the browser is back on the app. `name` is a label for your own use, e.g. `"my-idp"`. See [Custom IdP](../authentication#custom-idp) for an example.
