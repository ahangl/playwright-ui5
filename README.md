# @ahangl/playwright-ui5

UI5-aware end-to-end testing for [Playwright](https://playwright.dev), inspired by [wdi5](https://ui5-community.github.io/wdi5/):

- **Control API**: find UI5 controls by selector (`controlType`, `properties`, `bindingPath`, `i18NText`, `ancestor`, ...), call their methods (also as a chain with a single `await`), press, enter text, and get native Playwright `Locator`s. Every call first waits until UI5 is idle (no pending requests, timeouts or rendering).
- **Retrying assertions**: `await expect(ui5.control(sel)).toHaveUI5Text("Go")` retries until the control matches, like Playwright's locator assertions.
- **SAP Fiori elements V4 test library**: run the official [`sap.fe.test`](https://ui5.sap.com/#/api/sap.fe.test) page objects (`ListReport`, `ObjectPage`, `Shell`) with typed `Given`/`When`/`Then` chains, directly from Playwright tests.
- **SAP Build Work Zone**: the app is detected automatically in the launchpad iframe. A login provider for SAP IAS saves the session once, and it is reused through Playwright's `storageState`.

V2 Fiori elements (`sap.suite.ui.generic.template`) is not supported yet.

## Install

```bash
npm i -D @ahangl/playwright-ui5 @playwright/test
# optional, gives typed Fiori elements chains and typed control methods:
npm i -D @sapui5/types
```

## Quick start

```ts
// tests/books.spec.ts
import { test, expect } from "@ahangl/playwright-ui5";
import type Button from "sap/m/Button";

test("search books", async ({ ui5, fe }) => {
  await ui5.goTo("/index.html");

  // Control API, the counterpart of wdi5's browser.asControl()
  const go = await ui5.control<Button>({ controlType: "sap.m.Button", properties: { text: "Go" } });
  expect(await go.getText()).toBe("Go");

  // Fiori elements test library
  const { When, Then } = fe.init({
    onTheMainPage: { ListReport: { appId: "my.books", componentId: "BooksList", contextPath: "/Books" } },
    onTheDetailPage: { ObjectPage: { appId: "my.books", componentId: "BooksObjectPage", contextPath: "/Books" } },
  });
  await When.onTheMainPage.onFilterBar().iChangeFilterField("Author", "Edgar Allan Poe").and.iExecuteSearch();
  await Then.onTheMainPage.onTable().iCheckRows({}, 2);
  await When.onTheMainPage.onTable().iPressRow({ "Book ID": "251" });
  await Then.onTheDetailPage.onHeader().iCheckTitle("The Raven");
});
```

## Configuration

Set options per project or per file through Playwright's `use`:

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";
import type { UI5TestOptions } from "@ahangl/playwright-ui5";

export default defineConfig<UI5TestOptions>({
  use: {
    baseURL: "http://localhost:8080",
    ui5Options: {
      waitForUI5Timeout: 15_000, // wait for UI5 idle / controls to appear
      feTimeout: 30_000, // per Fiori elements statement (OPA timeout)
      appFrame: "auto", // "auto" | "main" | "<css selector of the app iframe>"
      ignoreAutoWaitUrls: [/\/longpoll/, "notifications\\?"], // requests that are never waited for
    },
  },
});
```

`appFrame: "auto"` uses the first of these that applies:
1. A visible launchpad application iframe (Work Zone / FLP). It is used even while UI5 is still loading inside it; the helper then waits for UI5 there.
2. Any other visible iframe that already runs UI5.
3. The main frame, for a standalone app.

If the main frame is a launchpad, the helper asks it where the current app runs (`sap.ushell` AppLifeCycle):
- The launchpad home page or an app embedded in the launchpad window uses the main frame.
- Otherwise the helper keeps waiting for the app iframe.

The detected frame is re-checked before each call, so opening an app from the home page (e.g. via `onTheShell` or `ui5.goTo("#Intent-action")`) switches to the new app's iframe.

`ignoreAutoWaitUrls` lists requests that waiting for UI5 ignores, like wdi5's option of the same name. Use it for requests that never finish, such as long polling or push channels. Without it, every call waits for them until `waitForUI5Timeout` runs out.
- Patterns are RegExps or strings. A string is a regex source, so escape `?` and `.` where needed.
- XHR and `fetch` requests are both covered.
- Requests opened before the library first talks to a frame are still waited for until they finish. In practice that's only a request opened during page load that never finishes.
- Ignoring `fetch` needs the `ui5` fixture: it saves the browser's own `fetch` before UI5 loads. If you create `new UI5(page, options)` yourself, only XHR requests are ignored.

## Control API (`ui5` fixture)

| Method | Description |
| --- | --- |
| `ui5.control<T>(selector, { timeout })` | Waits for a matching control. Await it to get a `RemoteControl`, or chain its methods (see [Chaining](#chaining)). Fails if none is found. |
| `ui5.controlOrNull(selector)` | Like `control`, but returns `null` when nothing matches. |
| `ui5.controls(selector)` | All controls that match now. Use `expect(...).toHaveUI5Count(n)` to wait for a number of matches. |
| `ui5.locator(selector)` | A Playwright `Locator` for the control's DOM element. |
| `ui5.press(selector)` / `ui5.enterText(selector, text)` | Shortcuts for the control's `press()` / `enterText()`. |
| `ui5.waitForUI5()` | Waits until UI5 is idle. |
| `ui5.goTo("#Intent-action" \| "/path")` | Navigates, then waits for UI5. A hash changes only the hash of the current page (or of `baseURL`). |
| `ui5.goTo({ route, params?, componentId?, replace?, componentTargetInfo? })` | Navigates with the app's router (`getRouter().navTo`), then waits for UI5. Without `componentId` it uses the only application component. |
| `ui5.exec(fn, ...args)` | Runs a function in the app frame. Returned controls become `RemoteControl`s. |
| `ui5.shell` | The same control API for the top-level frame, i.e. the launchpad / Work Zone shell (header, user menu). `ui5` itself works in the app frame. Example: `await ui5.shell.control({ id: "userActionsMenuHeaderButton" }).press()`. |
| `ui5.appFrame()` / `ui5.shellFrame()` | The Playwright `Frame` that runs the app / the launchpad frame. |

A `RemoteControl` gives you:
- Every public method of the control, returning a promise: `await input.getValue()`, `await table.getItems()`.
  - Controls come back as `RemoteControl`s.
  - Other objects come back as handles you can call methods on, such as a binding context.
  - You can pass a `RemoteControl` back as an argument.
- `press({ native? })` and `enterText(text, { clearTextFirst? })`. Both use OPA's actions (RecordReplay) and wait until the control is visible, enabled, not busy and not covered by a popup. `native: true` uses a real Playwright click instead. Both start right away and return a chain on the same control, so you can continue: `await button.press().getText()`.
- `locator()`, `getProperty()`, `getAggregation()`, `getBindingContextPath()` and `exec(fn)`.

Pass the UI5 class as a type parameter for typed methods: `ui5.control<Input>({...})` with `import type Input from "sap/m/Input"` (needs `@sapui5/types`).

Selectors support every field of UI5's RecordReplay (the same as wdi5), including `interaction`. It chooses the DOM element that `locator()` and `press({ native: true })` use:
- `"root"` (default): the control's root element.
- `"focus"`: e.g. the inner `<input>` of an input field.
- `"press"`, `"auto"`, or `{ idSuffix: "inner" }` for the element with the id `<control id>-inner`.

### Chaining

Method calls can be chained with a single `await`, like wdi5's fluent API. The whole chain runs in one browser round trip:

```ts
const path = await ui5.control<Table>({ controlType: "sap.m.Table" }).getItems(0).getBindingContextPath();
const title = await ui5.control<Table>(TABLE).getItems(0).getBindingContext()!.getProperty("title");
await ui5.control(GO_BUTTON).press();
```

- Aggregation getters take an index, as in wdi5: `getItems(0)` returns the first item.
- If a step fails, the error shows the whole chain, the failing step and what the steps before it returned:
  ```
  playwright-ui5: ui5.control({"controlType":"sap.m.Table"}).getItems(0).getNope() failed at .getNope():
    'getNope' is not a function on sap.m.ColumnListItem
    ✔ ui5.control({"controlType":"sap.m.Table"}) → sap.m.Table#…
    ✔ getItems(0) → sap.m.ColumnListItem#…
    ✘ getNope()
  ```
- Actions can be part of a chain: `await ui5.control(GO_BUTTON).press().getText()`. The chain continues on the same control after the action. If the action fails, the chain rejects and the later steps don't run.
- **Chains are lazy.** They only run when awaited, and the result is cached for that chain object. A forgotten `await` does nothing, so enable the ESLint rule [`@typescript-eslint/no-floating-promises`](https://typescript-eslint.io/rules/no-floating-promises/). `press()` and `enterText()` always run.
- `const table = await ui5.control(...)` still returns the `RemoteControl`, so tests can await each step as well.

## Assertions

`expect` from this package is Playwright's `expect` with extra matchers for UI5 controls. They work like Playwright's locator assertions:
- Each matcher looks up the control again and retries until the check passes or the `expect` timeout runs out.
- They also catch changes that happen after UI5 reports idle.
- They support `.not`.
- The failure message shows the control, the expected value and the last value read.

| Matcher | Passes when |
| --- | --- |
| `toHaveUI5Property(name, value)` | the property equals `value` (deep equality; a RegExp matches strings) |
| `toHaveUI5Text(text \| RegExp)` | the `text` property matches |
| `toBeUI5Enabled()` | `enabled` is `true` |
| `toBeUI5Visible()` | the control is rendered, `visible` is not `false`, and its DOM element is laid out |
| `toHaveUI5BindingPath(path, { modelName? })` | the path of the binding context matches |
| `toHaveUI5Count(n)` | `ui5.controls(selector)` finds `n` controls |

```ts
await expect(ui5.control(GO_BUTTON)).toBeUI5Enabled();
await expect(ui5.control(TABLE).getItems(0)).toHaveUI5BindingPath("/Books(201)");
await expect(ui5.controls({ controlType: "sap.m.ColumnListItem" })).toHaveUI5Count(2);
await expect(ui5.control(GO_BUTTON)).not.toHaveUI5Text("Stop", { timeout: 2_000 });
```

All matchers accept `{ timeout }`. To combine them with your own matchers, use Playwright's `mergeExpects`.

## Fiori elements V4 (`fe` fixture)

`fe.init(pages)` returns typed `Given` / `When` / `Then` roots. Each statement is recorded and only runs when you `await` it.
- A failing statement throws an error. The message contains the statement, OPA's diagnostics and the last checks that passed.
- The error points at your test line.
- The statement also appears as a step in the Playwright report and trace.

Page config:
- `{ ListReport: { appId, componentId, contextPath?, entitySet? } }`
  - `appId` is `sap.app.id` from the manifest.
  - `componentId` is the routing target id.
- `{ ObjectPage: {...} }`, with the same fields.
- `{ Shell: {} }`, for launchpad actions such as `iNavigateHome()` and `iNavigateBack()`. Shell statements run in the launchpad (top-level) frame; all other pages run in the app frame. With the SAP Build Work Zone shell bar these actions don't work, see [Known limitations](#known-limitations).

The method signatures come from SAP's typings in `@sapui5/types`:
- Without that package (and with `skipLibCheck`, the default for most setups) the chains are untyped, but they work the same.
- SAP's typings are sometimes stricter than the runtime. For example, `iCheckRows(5)` is typed as `iCheckRows({}, 5)`.

How it works: the library injects a small bridge into the app frame. The bridge creates the `sap.fe.test` page objects with `Opa5.createPageObjects`, queues your statement and runs `Opa.emptyQueue()`. This is the same approach as wdi5's FE integration. `sap/fe/test` is loaded from the app's own UI5 bootstrap, so its version always matches the app.

## SAP Build Work Zone authentication

Log in once in a setup project and reuse the session:

```ts
// tests/auth.setup.ts
import { test as setup } from "@playwright/test";
import { ias, login } from "@ahangl/playwright-ui5";

setup("log in", async ({ page }) => {
  await login(page, {
    url: process.env.WORKZONE_URL!,
    provider: ias({ idpDomain: process.env.WORKZONE_IDP }), // idpDomain only if XSUAA shows an IdP selection
    storageStatePath: ".auth/user.json",
  });
});
```

```ts
// playwright.config.ts (projects)
{ name: "setup", testMatch: /.*\.setup\.ts/ },
{ name: "workzone", dependencies: ["setup"], use: { baseURL: process.env.WORKZONE_URL, storageState: ".auth/user.json" } },
```

Credentials are read from `UI5_USERNAME` / `UI5_PASSWORD` (`credentialsFromEnv(prefix)`). Load a git-ignored `.env` with `import "dotenv/config"` in your config.

The `ias()` provider handles:
- Both the one-page form and the identifier-first flow (username, then password).
- The optional XSUAA IdP selection page.
- Skipping the passwordless/biometric setup prompt.
- Failing fast with the IdP's error message when credentials are wrong.

Selectors can be overridden. For other IdPs, implement the `AuthProvider` interface (`{ name, login(page, ctx) }`). For HTTP Basic Auth, use Playwright's built-in `httpCredentials`. MFA is not supported, so use a technical test user without MFA.

## Known limitations

- **`sap.fe.test` `Shell` actions don't work with the SAP Build Work Zone shell bar.** `iNavigateHome()` (and probably `iNavigateBack()`) rely on DOM ids of the classic launchpad header: it clicks `#shell-header-logo`, and the back action looks for `backBtn`. The Work Zone shell bar doesn't have these elements.
  - In Work Zone, navigate with `ui5.goTo("#Shell-home")` or `ui5.goTo("#Intent-action")` instead.
  - `Shell` page objects still work with the classic header (FLP sandbox, on-premise launchpad).
- **Fiori elements V2** (`sap.suite.ui.generic.template`) is not supported yet.
- **MFA** is not supported by the login providers.

## wdi5 → playwright-ui5

| wdi5 | playwright-ui5 |
| --- | --- |
| `await browser.asControl({ selector })` | `await ui5.control(selector)` (the selector is passed directly) |
| `await browser.asControl({ selector }).getItems(0).getTitle()` (fluent API) | `await ui5.control(selector).getItems(0).getTitle()` |
| `await browser.allControls({ selector })` | `await ui5.controls(selector)` |
| `control.press()` / `enterText()` | same (also chainable: `press().getText()`) |
| `control.getAggregation("items")` / `getItems()` | same (returns `RemoteControl[]`) |
| `control.getWebElement()` / `$()` | `control.locator()` (Playwright `Locator`) |
| `selector.interaction` | same |
| `wdio_ui5_key` / `forceSelect` | not needed: a `RemoteControl` is looked up by its id on every call |
| `expect(await control.getText()).toEqual("Go")` | same, or retrying: `await expect(control).toHaveUI5Text("Go")` |
| `browser.goTo({ sHash })` | `ui5.goTo("#...")` |
| `browser.goTo({ oRoute: { sComponentId, sName, oParameters, oComponentTargetInfo, bReplace } })` | `ui5.goTo({ componentId, route, params, componentTargetInfo, replace })` |
| `wdi5.toWorkZoneShell()` / `wdi5.toWorkZoneApp()` | `ui5.shell.control(...)` / `ui5.control(...)`, no switching needed |
| `btpWorkZoneEnablement`, `skipInjectUI5OnStart` | not needed: the app frame is detected and the library is injected automatically |
| `ignoreAutoWaitUrls` | `ui5Options.ignoreAutoWaitUrls` |
| `control.exec(function () { return this.getText() })` | `control.exec((control) => control.getText())`, see [Porting from wdi5](#porting-from-wdi5) |
| `control.fireEvent(name, { eval: () => mock })` | `control.exec(...)`, see [Porting from wdi5](#porting-from-wdi5) |
| `browser.screenshot()` | Playwright `page.screenshot()` / `screenshot: "only-on-failure"` |
| `wdi5.fe.initialize(pages)` + `execute((Given, When, Then) => ...)` | `const { Given, When, Then } = fe.init(pages)`, then `await When...` |
| `capabilities["wdi5:authentication"]` | `login(page, { provider: ias() })` in a setup project + `storageState` |
| `waitForUI5Timeout` | `ui5Options.waitForUI5Timeout` |

### Porting from wdi5

**`exec`:** in wdi5 the control is `this`, and the arguments start at the first parameter. Here the control is the first parameter, followed by the arguments, so TypeScript can type it:

```ts
// wdi5
await button.exec(function (suffix) { return this.getText() + suffix }, "!")
// playwright-ui5
await button.exec((control: Button, suffix: string) => control.getText() + suffix, "!");
```

The function runs in the browser. It can't use variables of the test, so pass them as arguments.

**Functions as arguments:** method arguments are sent to the browser as data, so a function can't be an argument. Playwright rejects it with "Attempting to serialize unexpected value". wdi5's `fireEvent` mocks with `eval` become an `exec` that builds the mock in the browser:

```ts
// wdi5
await list.fireEvent("itemPress", { eval: () => ({ listItem: { data: () => "account.relationships" } }) })
// playwright-ui5
await list.exec((l, key) => l.fireItemPress({ listItem: { data: () => key } }), "account.relationships");
```

## Development

```bash
npm install
npm test              # builds, then runs the self-tests against the local FE fixture app (mock OData service)
npm run test:workzone # opt-in tests against a real Work Zone site (see .env.example)
npm run typecheck
```

The fixture app in `test/fixture-app` is a Fiori elements V4 List Report + Object Page. It is served by `ui5 serve` with `@sap-ux/ui5-middleware-fe-mockserver` and bootstrapped from the UI5 CDN. `test/fixture-app/webapp/test/iframe.html` hosts it in an iframe to simulate Work Zone.

## License

MIT
