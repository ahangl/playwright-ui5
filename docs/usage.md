---
description: "The concepts of the ui5 fixture: finding controls, RemoteControl, actions, chains, assertions and navigation."
---

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

Every call first waits until UI5 is idle (no pending requests, timeouts, promises or rendering).

`ui5.locator()` returns a `Promise<Locator>`, because it first finds the control. Await it: `const go = await ui5.locator(GO_BUTTON)`. Without `await`, Playwright reports confusing errors such as `go.click is not a function` or "expected a Locator".

All methods: [ui5 reference](./api/ui5#finding-controls).

## RemoteControl

A `RemoteControl` represents a control in the browser. It is looked up by its id on every call, so it stays valid across re-rendering. Every public method of the control is available and returns a promise:

```ts
await input.setValue("Poe");
const items = await table.getItems(); // RemoteControl[]
const context = await item.getBindingContext(); // a remote object
await context.getProperty("title");
```

Controls come back as `RemoteControl`s, other UI5 objects as remote objects, plain data as values. Pass the UI5 class as a type parameter for typed methods: `ui5.control<Input>({...})` with `import type Input from "sap/m/Input"` (needs `@sapui5/types`). Return values, arguments, properties and helpers: [RemoteControl reference](./api/ui5#remotecontrol).

### press and enterText

```ts
await go.press();
await input.enterText("Edgar Allan Poe");
await go.press({ native: true }); // real Playwright click on the DOM element
```

Both use OPA's actions and wait until the control is visible, enabled, not busy and not covered by a popup. Details: [`press()`](./api/ui5#press), [`enterText()`](./api/ui5#entertext).

### exec

`exec` runs a function in the browser. It is serialized, so it can't use variables of the test: pass them as arguments.

```ts
const text = await go.exec((control: Button, suffix: string) => control.getText() + suffix, "!");
```

Details: [`control.exec()`](./api/ui5#exec), [`ui5.exec()`](./api/ui5#ui5-exec).

### Fluent API

Method calls can be chained with a single `await`, like wdi5's fluent API. The whole chain runs in one browser round trip:

```ts
const path = await ui5.control<Table>({ controlType: "sap.m.Table" }).getItems(0).getBindingContextPath();
await ui5.control(GO_BUTTON).press().getText();
```

**Chains are lazy:** they only run when awaited. A forgotten `await` does nothing, so enable [`no-floating-promises`](./installation#typescript). Details: [Chains](./api/ui5#chains).

## Assertions

`expect` from this package adds UI5 matchers to Playwright's `expect`. Like Playwright's locator assertions, they retry until the check passes. Pass the chain itself, without `await`:

```ts
await expect(ui5.control(GO_BUTTON)).toBeUI5Enabled();
await expect(ui5.control(TABLE).getItems(0)).toHaveUI5BindingPath("/Books(201)");
await expect(ui5.controls({ controlType: "sap.m.ColumnListItem" })).toHaveUI5Count(2);
```

`expect(await control.getText()).toBe("Go")` checks only once. All matchers: [Assertions reference](./api/expect).

## Navigation

`ui5.goTo()` navigates and then waits for UI5. It takes a path (relative to `baseURL`), a hash (intent navigation in a launchpad) or a route of the app's router:

```ts
await ui5.goTo("/index.html");
await ui5.goTo("#Books-display");
await ui5.goTo({ route: "BooksObjectPage", params: { key: "251" } });
```

Navigating with the router doesn't reload the page. Details: [`ui5.goTo()`](./api/ui5#ui5-goto).

## Launchpad and Work Zone shell

`ui5` works in the app frame. `ui5.shell` is the same control API for the top-level frame, i.e. the launchpad or Work Zone shell (header, user menu):

```ts
await ui5.shell.control({ id: "userActionsMenuHeaderButton" }).press();
await ui5.control({ controlType: "sap.m.Button", properties: { text: "Go" } }).press(); // app frame again
```

There is no switching between frames.

## Without fixtures

The `UI5` class works with any `Page`, e.g. in a global setup: `new UI5(page, options)`. See [Without fixtures](./api/ui5#without-fixtures).
