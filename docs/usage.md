# Usage

::: info Works in every UI5 app
The control API, the assertions and the navigation work in freestyle apps and in Fiori elements V2 and V4 apps, standalone, in a launchpad or in SAP Build Work Zone. Only the [Fiori elements test library](./fe-testlib) needs Fiori elements V4.
:::

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

- `ui5`: the control API for the app frame ([`UI5`](#control-retrieval)).
- `fe`: the [Fiori elements test library](./fe-testlib) (Fiori elements V4 apps only).
- All of Playwright's fixtures (`page`, `context`, ...) are still available.

## Control retrieval

| Method                                                  | Description                                                                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ui5.control<T>(selector, { timeout })`                 | Waits for a matching control. Await it to get a `RemoteControl`, or [chain](#fluent-api) its methods. Fails if none is found. |
| `ui5.controlOrNull(selector)`                           | Like `control`, but returns `null` when nothing matches.                                                                      |
| `ui5.controls(selector)`                                | All controls that match now (no waiting for matches). Use `toHaveUI5Count(n)` to wait for a number of matches.                |
| `ui5.locator(selector)`                                 | A Playwright `Locator` for the control's DOM element.                                                                         |
| `ui5.press(selector)` / `ui5.enterText(selector, text)` | Shortcuts for the control's `press()` / `enterText()`.                                                                        |

Every call first waits until UI5 is idle (no pending requests, timeouts, rendering or busy indicators). The selector format is described in [Locators](./locators).

`ui5.locator()` returns a `Promise<Locator>`, because it first finds the control. Await it: `const go = await ui5.locator(GO_BUTTON)`. Without `await`, Playwright reports confusing errors such as `go.click is not a function` or "expected a Locator".

```ts
import type Button from "sap/m/Button";

const go = await ui5.control<Button>({ controlType: "sap.m.Button", properties: { text: "Go" } });
const rows = await ui5.controls({ controlType: "sap.m.ColumnListItem" });
const dialog = await ui5.controlOrNull({ controlType: "sap.m.Dialog" }, { timeout: 2_000 });
```

## API methods

A `RemoteControl` represents a control in the browser. It is looked up by its id on every call, so it stays valid across re-rendering.

### Control methods

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

### Helpers

| Member                              | Description                                                         |
| ----------------------------------- | ------------------------------------------------------------------- |
| `id`, `className`, `methods`        | Global id, UI5 class name, names of the public methods.             |
| `getProperty(name)`                 | A property value.                                                   |
| `getAggregation(name)`              | An aggregation as `RemoteControl` / `RemoteControl[]`.              |
| `getBindingContextPath(modelName?)` | The path of the binding context, e.g. `"/Books(201)"`.              |
| `locator()`                         | A Playwright `Locator` for the control's DOM element.               |
| `exec(fn, ...args)`                 | Runs a function in the browser with the control as first parameter. |
| `reload()`                          | Re-reads id, class and DOM reference, e.g. after re-rendering.      |

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

| Matcher                                      | Passes when                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `toHaveUI5Property(name, value)`             | the property equals `value` (deep equality; a RegExp matches strings)              |
| `toHaveUI5Text(text \| RegExp)`              | the `text` property matches                                                        |
| `toBeUI5Enabled()`                           | `enabled` is `true`                                                                |
| `toBeUI5Visible()`                           | the control is rendered, `visible` is not `false`, and its DOM element is laid out |
| `toHaveUI5BindingPath(path, { modelName? })` | the path of the binding context matches                                            |
| `toHaveUI5Count(n)`                          | `ui5.controls(selector)` finds `n` controls                                        |

```ts
await expect(ui5.control(GO_BUTTON)).toBeUI5Enabled();
await expect(ui5.control(TABLE).getItems(0)).toHaveUI5BindingPath("/Books(201)");
await expect(ui5.controls({ controlType: "sap.m.ColumnListItem" })).toHaveUI5Count(2);
await expect(ui5.control(GO_BUTTON)).not.toHaveUI5Text("Stop", { timeout: 2_000 });
```

Pass the chain itself (without `await`) to get the retrying behaviour. `expect(await control.getText()).toBe("Go")` checks once.

Playwright's own matchers work on locators: `await expect(await ui5.locator(GO_BUTTON)).toBeVisible()`.

## Navigation

| Call                                                                         | Description                                                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ui5.goTo("/path")`                                                          | `page.goto` (relative to `baseURL`), then waits for UI5.                                               |
| `ui5.goTo("#Intent-action")` / `ui5.goTo("#/Books(1)")`                      | Changes only the hash of the current page (or of `baseURL`). In a launchpad this is intent navigation. |
| `ui5.goTo({ route, params?, componentId?, replace?, componentTargetInfo? })` | Navigates with the app's router (`getRouter().navTo`), without reloading.                              |
| `ui5.waitForUI5()`                                                           | Waits until UI5 is idle.                                                                               |

```ts
await ui5.goTo({ route: "BooksObjectPage", params: { key: "251" } });
```

Without `componentId`, the router of the only application component is used.

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
