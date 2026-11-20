# ui5

The `ui5` fixture is an instance of the `UI5` class: the control API for the frame that runs the app. It works in every UI5 app, standalone, in a launchpad or in SAP Build Work Zone.

```ts
import { test } from "@ahangl/playwright-ui5";

test("...", async ({ ui5 }) => {
  await ui5.goTo("/index.html");
  await ui5.press({ controlType: "sap.m.Button", properties: { text: "Go" } });
});
```

Every call first waits until UI5 is idle: no pending requests, timeouts, rendering or busy indicators. The wait is limited by [`waitForUI5Timeout`](./configuration#waitforui5timeout). Most calls take `{ timeout }` to override it once.

[Learn more: Usage](../usage)

## Finding controls

### ui5.control()

```ts
ui5.control<T>(selector: UI5Selector, options?: { timeout?: number }): ControlChain<T>
```

Waits until a control matches the [selector](../locators) and returns it as a [`RemoteControl`](./remote-control) when awaited. Fails if none appears within the timeout. Without `await`, you can call the control's methods directly as a [chain](./remote-control#chains). Pass the UI5 class as `T` for typed methods (needs `@sapui5/types`). A `timeout` given here also applies to later calls on the returned control.

```ts
import type Button from "sap/m/Button";

const go = await ui5.control<Button>({ controlType: "sap.m.Button", properties: { text: "Go" } });
const text = await ui5.control<Button>({ id: "goButton" }).getText(); // a chain, one round trip
```

### ui5.controlOrNull()

```ts
ui5.controlOrNull<T>(selector: UI5Selector, options?: { timeout?: number }): Promise<RemoteControl<T> | null>
```

Like `control()`, but returns `null` when nothing matches within the timeout. Use a short timeout for optional controls.

```ts
const dialog = await ui5.controlOrNull({ controlType: "sap.m.Dialog" }, { timeout: 2_000 });
if (dialog) await dialog.close();
```

### ui5.controls()

```ts
ui5.controls<T>(selector: UI5Selector, options?: { timeout?: number }): ControlsQuery<T>
```

All controls that match now, as `RemoteControl[]`. It waits until UI5 is idle but not for matches, so it can return an empty array. To wait for a number of matches, pass it to [`toHaveUI5Count()`](./expect#tohaveui5count).

```ts
const rows = await ui5.controls({ controlType: "sap.m.ColumnListItem" });
await expect(ui5.controls({ controlType: "sap.m.ColumnListItem" })).toHaveUI5Count(2);
```

### ui5.locator()

```ts
ui5.locator(selector: UI5Selector, options?: { timeout?: number }): Promise<Locator>
```

A Playwright `Locator` for the control's DOM element. It first finds the control, so await it. The selector's [`interaction`](../locators#interaction) picks another element of the control, e.g. the inner `<input>`.

```ts
const go = await ui5.locator({ controlType: "sap.m.Button", properties: { text: "Go" } });
await expect(go).toBeVisible();
```

## Actions

### ui5.press()

```ts
ui5.press(selector: UI5Selector, options?: { timeout?: number; native?: boolean }): Promise<void>
```

Shortcut for `ui5.control(selector).press()`, as one step in the report. See [`press()`](./remote-control#press).

```ts
await ui5.press({ controlType: "sap.m.Button", properties: { text: "Go" } });
```

### ui5.enterText()

```ts
ui5.enterText(
  selector: UI5Selector,
  text: string,
  options?: { timeout?: number; clearTextFirst?: boolean }
): Promise<void>
```

Shortcut for `ui5.control(selector).enterText(text)`, as one step in the report. See [`enterText()`](./remote-control#entertext).

```ts
await ui5.enterText({ controlType: "sap.m.Input", labelFor: { text: "Author" } }, "Edgar Allan Poe");
```

## Navigation and waiting

### ui5.goTo()

```ts
ui5.goTo(target: string | UI5Route, options?: { timeout?: number }): Promise<void>
```

Navigates and waits until UI5 is idle:

- **A path or URL** (`"/index.html"`): `page.goto`, relative to `baseURL`.
- **A hash** (`"#Books-display"`, `"#/Books(1)"`): changes only the hash of the current page, or of `baseURL` if nothing is loaded yet. In a launchpad this is intent navigation.
- **A route** (`UI5Route`): navigates with the app's router (`getRouter().navTo`), without reloading.

```ts
interface UI5Route {
  route: string; // route name from the manifest
  params?: Record<string, unknown>; // e.g. { key: "251" }
  componentId?: string; // default: the only application component with a router
  replace?: boolean; // replace the history entry
  componentTargetInfo?: Record<string, unknown>; // for nested components
}
```

```ts
await ui5.goTo("/index.html");
await ui5.goTo("#Books-display");
await ui5.goTo({ route: "BooksObjectPage", params: { key: "251" } });
```

### ui5.waitForUI5()

```ts
ui5.waitForUI5(options?: { timeout?: number }): Promise<void>
```

Waits until UI5 is idle. Rarely needed, because every call already waits. Use it before plain Playwright code that reads the page.

```ts
await ui5.waitForUI5();
await expect(page.getByText("Saved")).toBeVisible();
```

## Browser code

### ui5.exec()

```ts
ui5.exec<R, A>(fn: (...args: A) => R, ...args: A): Promise<Remote<R>>
```

Runs a function in the app frame after UI5 is idle. The function is serialized, so it can't use variables of the test: pass them as arguments. Returned controls become `RemoteControl`s, other UI5 objects become [remote objects](./remote-control#remote-objects). For a function that gets a control as its first parameter, use [`control.exec()`](./remote-control#exec).

```ts
const hash = await ui5.exec(() => window.location.hash);
const text = await ui5.exec((prefix: string) => prefix + document.title, "Title: ");
```

## Launchpad and frames

### ui5.shell

```ts
ui5.shell: UI5
```

The same control API for the top-level frame, i.e. the launchpad or Work Zone shell (header, user menu). `ui5` itself stays in the app frame, so there is no switching back.

```ts
await ui5.shell.control({ id: "userActionsMenuHeaderButton" }).press();
```

### ui5.appFrame()

```ts
ui5.appFrame(): Promise<Frame>
```

The Playwright `Frame` that runs the app, found with the [`appFrame`](./configuration#appframe) option. It is checked again before each call, so it follows navigation into another app.

### ui5.shellFrame()

```ts
ui5.shellFrame(): Frame
```

The top-level `Frame` (the launchpad, if there is one).

### ui5.resetFrame()

```ts
ui5.resetFrame(): void
```

Forgets the app frame found last, so the next call looks for it again. `goTo()` with a string (path, URL or hash) does this already. You only need it if your own Playwright code replaces the app frame.

## Other

### ui5.version()

```ts
ui5.version(): Promise<string>
```

The UI5 version of the app frame, e.g. `"1.136.0"`.

### ui5.page

```ts
ui5.page: Page
```

The Playwright `Page` the instance works on.

### ui5.options

```ts
ui5.options: ResolvedUI5Options
```

The [options](./configuration) with their defaults filled in.

## Without fixtures

```ts
new UI5(page: Page, options?: UI5Options, baseURL?: string)
```

Creates the control API for any `Page`, e.g. in a global setup. `baseURL` is used by `goTo()` for relative paths and hashes. Outside of a running test, calls don't create report steps. Ignoring `fetch` requests with [`ignoreAutoWaitUrls`](./configuration#ignoreautowaiturls) needs the fixture.

```ts
import { UI5 } from "@ahangl/playwright-ui5";

const ui5 = new UI5(page, { appFrame: "#application-frame" }, "http://localhost:8080");
await ui5.goTo("/index.html");
```
