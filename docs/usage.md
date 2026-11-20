# Usage

::: info Works in every UI5 app
The control API, the assertions and the navigation work in freestyle apps and in Fiori elements V2 and V4 apps, standalone, in a launchpad or in SAP Build Work Zone. Only the [Fiori elements test library](./fe-testlib) needs Fiori elements V4.
:::

This page explains the concepts. Every method with its signature is in the [API reference](./api/).

## Files

Tests are ordinary Playwright test files (by default `*.spec.ts` in `testDir`). Import `test` and `expect` from this package:

```ts
import { test, expect } from "@ahangl/playwright-ui5";

test.beforeEach(async ({ ui5 }) => {
  await ui5.goTo("/index.html");
});

test("finds the Go button", async ({ ui5 }) => {
  await expect(ui5.control({ controlType: "sap.m.Button", properties: { text: "Go" } })).toBeUI5Enabled();
});
```

The fixtures are:

- `ui5`: the control API for the app frame ([reference](./api/ui5)).
- `fe`: the [Fiori elements test library](./fe-testlib) (Fiori elements V4 apps only).
- All of Playwright's fixtures (`page`, `context`, ...) are still available.

## Finding controls

A control is found by a selector, the same format as wdi5 and OPA (see [Locators](./locators)):

```ts
import type Button from "sap/m/Button";

const go = await ui5.control<Button>({ controlType: "sap.m.Button", properties: { text: "Go" } });
const rows = await ui5.controls({ controlType: "sap.m.ColumnListItem" });
const dialog = await ui5.controlOrNull({ controlType: "sap.m.Dialog" }, { timeout: 2_000 });
```

- `ui5.control()` waits until a control matches and fails if none does.
- `ui5.controlOrNull()` returns `null` instead of failing.
- `ui5.controls()` returns all controls that match now. It doesn't wait for matches. Use [`toHaveUI5Count(n)`](./api/expect#tohaveui5count) to wait for a number of matches.
- `ui5.locator()` gives a Playwright `Locator` for the control's DOM element.

Every call first waits until UI5 is idle (no pending requests, timeouts, rendering or busy indicators).

`ui5.locator()` returns a `Promise<Locator>`, because it first finds the control. Await it: `const go = await ui5.locator(GO_BUTTON)`. Without `await`, Playwright reports confusing errors such as `go.click is not a function` or "expected a Locator".

All methods: [ui5 reference](./api/ui5#finding-controls).

## RemoteControl

A `RemoteControl` represents a control in the browser. It is looked up by its id on every call, so it stays valid across re-rendering.

Every public method of the control is available and returns a promise:

```ts
await input.getValue();
await input.setValue("Poe");
const items = await table.getItems(); // RemoteControl[]
const context = await item.getBindingContext(); // handle to the browser object
await context.getProperty("title");
```

- Controls come back as `RemoteControl`s.
- Other objects (binding contexts, models, ...) come back as handles you can call methods on.
- Plain values (strings, numbers, arrays, plain objects) come back as values.
- You can pass a `RemoteControl` back as an argument, e.g. `await parent.indexOfAggregation("content", go)`.
- Functions can't be arguments, see [Recipes](./recipes#mock-event-parameters).

Pass the UI5 class as a type parameter for typed methods: `ui5.control<Input>({...})` with `import type Input from "sap/m/Input"` (needs `@sapui5/types`).

Besides the control's own methods, a `RemoteControl` has helpers such as `id`, `className`, `methods`, `getProperty()`, `getBindingContextPath()` and `locator()`. All of them: [RemoteControl reference](./api/remote-control).

### press and enterText

```ts
await go.press();
await input.enterText("Edgar Allan Poe");
await input.enterText("more", { clearTextFirst: false });
await go.press({ native: true }); // real Playwright click on the DOM element
```

- Both use OPA's actions (RecordReplay) and wait until the control is visible, enabled, not busy and not covered by a popup.
- `native: true` uses a Playwright click instead.
- Both start right away and return a chain on the same control: `await go.press().getText()`.

### exec

Runs a function in the app frame. The control is the first parameter, followed by your arguments. Returned controls become `RemoteControl`s.

```ts
const text = await go.exec((control: Button, suffix: string) => control.getText() + suffix, "!");
const hash = await ui5.exec((prefix: string) => prefix + window.location.hash, "at ");
```

The function is serialized and runs in the browser. It can't use variables of the test, so pass them as arguments.

### Fluent API

Method calls can be chained with a single `await`, like wdi5's fluent API. The whole chain runs in one browser round trip:

```ts
const path = await ui5.control<Table>({ controlType: "sap.m.Table" }).getItems(0).getBindingContextPath();
const title = await ui5.control<Table>(TABLE).getItems(0).getBindingContext()!.getProperty("title");
await ui5.control(GO_BUTTON).press().getText();
```

- Aggregation getters take an index, as in wdi5: `getItems(0)` returns the first item.
- If a step fails, the error shows the whole chain, the failing step and what the steps before it returned.
- After an action the chain continues on the same control. If the action fails, the chain rejects and later steps don't run.
- **Chains are lazy.** They only run when awaited, and the result is cached for that chain object. A forgotten `await` does nothing, so enable [`@typescript-eslint/no-floating-promises`](https://typescript-eslint.io/rules/no-floating-promises/). `press()` and `enterText()` always run.
- `const table = await ui5.control(...)` still returns the `RemoteControl`, so tests can await each step as well.

## Assertions

`expect` from this package is Playwright's `expect` with extra matchers for UI5 controls. They work like Playwright's locator assertions:

- Each matcher looks up the control again and retries until the check passes or the `expect` timeout runs out.
- They also catch changes that happen after UI5 reports idle.
- They support `.not` and `{ timeout }`.
- The failure message shows the control, the expected value and the last value read.

```ts
await expect(ui5.control(GO_BUTTON)).toBeUI5Enabled();
await expect(ui5.control(TABLE).getItems(0)).toHaveUI5BindingPath("/Books(201)");
await expect(ui5.controls({ controlType: "sap.m.ColumnListItem" })).toHaveUI5Count(2);
await expect(ui5.control(GO_BUTTON)).not.toHaveUI5Text("Stop", { timeout: 2_000 });
```

Pass the chain itself (without `await`) to get the retrying behaviour. `expect(await control.getText()).toBe("Go")` checks once.

Playwright's own matchers work on locators: `await expect(await ui5.locator(GO_BUTTON)).toBeVisible()`.

All matchers: [Assertions reference](./api/expect).

## Navigation

`ui5.goTo()` navigates and then waits for UI5. It takes a path (relative to `baseURL`), a hash (intent navigation in a launchpad) or a route of the app's router:

```ts
await ui5.goTo("/index.html");
await ui5.goTo("#Books-display");
await ui5.goTo({ route: "BooksObjectPage", params: { key: "251" } });
```

Navigating with the router doesn't reload the page. Without `componentId`, the router of the only application component is used. Details: [`ui5.goTo()`](./api/ui5#ui5-goto).

`ui5.waitForUI5()` waits until UI5 is idle. It is rarely needed, because every call waits already. Use it before plain Playwright code that reads the page.

## Launchpad and Work Zone shell

`ui5` works in the app frame. `ui5.shell` is the same control API for the top-level frame, i.e. the launchpad / Work Zone shell (header, user menu):

```ts
await ui5.shell.control({ id: "userActionsMenuHeaderButton" }).press();
await ui5.control({ controlType: "sap.m.Button", properties: { text: "Go" } }).press(); // app frame again
```

There is no switching between frames. `ui5.appFrame()` and `ui5.shellFrame()` return the Playwright `Frame`s.

## Screenshots

Use Playwright's screenshots:

```ts
await page.screenshot({ path: "books.png" });
await (await ui5.locator(TABLE)).screenshot({ path: "table.png" });
```

or `use: { screenshot: "only-on-failure" }` in the config.

## Without fixtures

The `UI5` class works with any `Page`, e.g. in a global setup:

```ts
import { UI5 } from "@ahangl/playwright-ui5";

const ui5 = new UI5(page, { appFrame: "#application-frame" }, "http://localhost:8080");
await ui5.control(GO_BUTTON).press();
```

Outside of a running test, calls don't create report steps. Ignoring `fetch` requests with `ignoreAutoWaitUrls` needs the fixture.
