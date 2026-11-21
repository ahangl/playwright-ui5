---
description: "Reference of the ui5 fixture and RemoteControl: every method and property with signature and example."
---

# ui5 and RemoteControl

The `ui5` fixture is an instance of the `UI5` class: the control API for the frame that runs the app. The controls it finds are [`RemoteControl`s](#remotecontrol). It works in every UI5 app, standalone, in a launchpad or in SAP Build Work Zone.

```ts
import { test } from "@ahangl/playwright-ui5";

test("...", async ({ ui5 }) => {
  await ui5.goTo("/index.html");
  await ui5.press({ controlType: "sap.m.Button", properties: { text: "Go" } });
});
```

Every lookup, method call and action first waits until UI5 is idle: no pending requests, timeouts, promises or rendering. Actions also wait until the control is visible, enabled and not busy. The wait is limited by [`waitForUI5Timeout`](../configuration#waitforui5timeout). Most calls take `{ timeout }` to override it once.

[Learn more: Usage](../usage)

## Finding controls

### ui5.control()

```ts
ui5.control<T>(selector: UI5Selector, options?: { timeout?: number }): ControlChain<T>
```

Waits until a control matches the [selector](../locators) and returns it as a [`RemoteControl`](#remotecontrol) when awaited. Fails if none appears within the timeout. Without `await`, you can call the control's methods directly as a [chain](#chains). Pass the UI5 class as `T` for typed methods (needs `@sapui5/types`). A `timeout` given here also applies to later calls on the returned control.

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

All controls that match now, as `RemoteControl[]`. It waits until UI5 is idle but not for matches, so it can return an empty array. It needs UI5 1.80 or later. To wait for a number of matches, pass it to [`toHaveUI5Count()`](./expect#tohaveui5count).

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

Shortcut for `ui5.control(selector).press()`, as one step in the report. See [`press()`](#press).

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

Shortcut for `ui5.control(selector).enterText(text)`, as one step in the report. See [`enterText()`](#entertext).

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

Runs a function in the app frame after UI5 is idle. The function is serialized, so it can't use variables of the test: pass them as arguments. Returned controls become `RemoteControl`s, other UI5 objects become [remote objects](#remote-objects). For a function that gets a control as its first parameter, use [`control.exec()`](#exec).

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

The Playwright `Frame` that runs the app, found with the [`appFrame`](../configuration#appframe) option. It is checked again before each call, so it follows navigation into another app.

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

The [options](../configuration) with their defaults filled in.

## Without fixtures

```ts
new UI5(page: Page, options?: UI5Options, baseURL?: string)
```

Creates the control API for any `Page`, e.g. in a global setup. `goTo()` passes paths to `page.goto()`, which resolves them against the browser context's `baseURL`. The `baseURL` argument is only used for `goTo("#...")` on an empty page. Outside of a running test, calls don't create report steps. Ignoring `fetch` requests with [`ignoreAutoWaitUrls`](../configuration#ignoreautowaiturls) needs the fixture.

```ts
import { UI5 } from "@ahangl/playwright-ui5";

const ui5 = new UI5(page, { appFrame: "#application-frame" });
await ui5.goTo("http://localhost:8080/index.html");
```

## RemoteControl

A `RemoteControl` represents a UI5 control in the browser. You get one by awaiting [`ui5.control()`](#ui5-control), from [`ui5.controls()`](#ui5-controls), or as the return value of a control method. It is looked up by its id on every call, so it stays valid across re-rendering.

```ts
import type Input from "sap/m/Input";

const input = await ui5.control<Input>({ controlType: "sap.m.Input", labelFor: { text: "Author" } });
await input.enterText("Poe");
const value = await input.getValue(); // any public method of the control
```

[Learn more: Usage](../usage#remotecontrol)

## Control methods

```ts
control.<method>(...args): UI5Chain<R>
```

Every public method of the control runs in the browser and returns a promise. Without `await` it is a [chain](#chains).

- Controls come back as `RemoteControl`s, arrays of controls as `RemoteControl[]`.
- Other UI5 objects (binding contexts, models, ...) come back as [remote objects](#remote-objects).
- Plain values (strings, numbers, arrays, plain objects, dates) come back as values.
- Arguments can be plain values, RegExps, `RemoteControl`s and remote objects. Functions can't be arguments, see [Cookbook](../cookbook#mock-event-parameters).
- Aggregation getters take an index, as in wdi5: `table.getItems(0)` returns the first item.

```ts
await input.setValue("Poe");
const items = await table.getItems(); // RemoteControl[]
const first = await table.getItems(0); // RemoteControl
await parent.indexOfAggregation("content", go);
```

Typing: `ui5.control<Input>(...)` with `import type Input from "sap/m/Input"` types every method from `@sapui5/types`. Without a type parameter, any method name compiles and returns `any` when awaited.

## Control properties

### control.id

```ts
control.id: string
```

The global id of the control.

### control.className

```ts
control.className: string
```

The UI5 class name, e.g. `"sap.m.Button"`.

### control.methods

```ts
control.methods: readonly string[]
```

The names of the control's public methods. Useful to find out what a control can do, see [Inspecting controls](../running#inspecting-controls).

### control.domRefId

```ts
control.domRefId: string | null
```

The id of the control's root DOM element, `null` while the control isn't rendered.

### control.frame

```ts
control.frame: Frame
```

The Playwright `Frame` the control lives in.

## Control helpers

### getProperty()

```ts
control.getProperty<R>(name: string): Promise<R>
```

The value of a property, e.g. `await button.getProperty("text")`.

### setProperty()

```ts
control.setProperty(name: string, value: unknown): Promise<void>
```

Sets a property, e.g. `await input.setProperty("value", "Poe")`. This doesn't fire events. To act like a user, use [`enterText()`](#entertext).

### getAggregation()

```ts
control.getAggregation<R>(name: string): Promise<R>
```

The aggregated control or controls, as `RemoteControl` or `RemoteControl[]`.

```ts
const items = await table.getAggregation<RemoteControl[]>("items");
```

### getBindingContextPath()

```ts
control.getBindingContextPath(modelName?: string): Promise<string | undefined>
```

The path of the control's binding context (of the default model or of `modelName`), e.g. `"/Books(201)"`. `undefined` if the control has none. To wait for a path, use [`toHaveUI5BindingPath()`](./expect#tohaveui5bindingpath).

### call()

```ts
control.call<R>(method: string, ...args: unknown[]): Promise<R>
```

Calls a method by name. The same as `control[method](...args)`. Useful when the name is in a variable.

### locator()

```ts
control.locator(): Locator // on a RemoteControl
chain.locator(): Promise<Locator> // on a chain, e.g. ui5.control(...).locator()
```

A Playwright `Locator` for the control's root DOM element, e.g. for screenshots or Playwright's own matchers. [`ui5.locator()`](#ui5-locator) with [`interaction`](../locators#interaction) gives other elements of the control.

```ts
await expect(go.locator()).toBeVisible();
await (await ui5.control(TABLE).locator()).screenshot({ path: "table.png" });
```

### exec()

```ts
control.exec<R, A>(fn: (control: any, ...args: A) => R, ...args: A): Promise<Remote<R>>
```

Runs a function in the browser with the control as first parameter, after UI5 is idle. The function is serialized, so it can't use variables of the test: pass them as arguments. Return values come back like method results.

```ts
import type Button from "sap/m/Button";

const text = await go.exec((control: Button, suffix: string) => control.getText() + suffix, "!");
```

### reload()

```ts
control.reload(): Promise<RemoteControl>
```

Reads id, class and DOM reference again and returns a new `RemoteControl`, e.g. after the control was re-rendered with another DOM element. Method calls don't need it, they look up the control by id anyway.

## Control actions

### press()

```ts
control.press(options?: { native?: boolean }): ControlChain<T>
```

Presses the control with OPA's `Press` action. It waits until the control is visible, enabled, not busy and not covered by a popup, and picks the right inner element (e.g. the icon of a `SearchField`). With `native: true` it's a real Playwright click on the control's DOM element.

It starts right away and returns a chain on the same control: `await go.press().getText()`. Awaiting it rejects if the press failed.

```ts
await go.press();
await go.press({ native: true });
```

### enterText()

```ts
control.enterText(text: string, options?: { clearTextFirst?: boolean }): ControlChain<T>
```

Enters text with OPA's `EnterText` action: it focuses the control, types the text and fires `change`. `clearTextFirst` defaults to `true`. It starts right away and returns a chain on the same control.

```ts
await input.enterText("Edgar Allan Poe");
await input.enterText(" Jr.", { clearTextFirst: false });
const value = await input.enterText("Poe").getValue();
```

## Chains

```ts
ui5.control<T>(selector).<method>(...).<method>(...): UI5Chain<R>
```

Method calls can be chained with a single `await`, like wdi5's fluent API. The whole chain runs in one browser round trip.

- `ui5.control()` returns a `ControlChain`: awaited, it's the `RemoteControl`. The helpers `press`, `enterText`, `exec`, `locator`, `getBindingContextPath` and `reload` can be called on it directly.
- Each method call returns a `UI5Chain` for its result. Its methods are those of the result type.
- Chains are lazy: they only run when awaited, and the result is cached for that chain object. `press()` and `enterText()` are the exception, they always run.
- If a step fails, the error shows the whole chain, the failing step and what the steps before it returned.
- Pass a chain without `await` to [`expect`](./expect) to retry the whole chain.

```ts
const path = await ui5.control<Table>({ controlType: "sap.m.Table" }).getItems(0).getBindingContextPath();
const title = await ui5.control<Table>(TABLE).getItems(0).getBindingContext()!.getProperty("title");
await expect(ui5.control<Table>(TABLE).getItems(0)).toHaveUI5BindingPath("/Books(201)");
```

[Learn more: Fluent API](../usage#fluent-api)

## Remote objects

A `RemoteObject` represents any other UI5 object in the browser: a binding context, a model, a router. Its methods work like control methods, typed if the method's return type is known.

```ts
const context = await item.getBindingContext(); // RemoteObject
const title = await context.getProperty("title");
```

### object.className

```ts
object.className: string
```

The UI5 class name, e.g. `"sap.ui.model.odata.v4.Context"`.

### object.methods

```ts
object.methods: readonly string[]
```

The names of the object's methods.

### object.handle

```ts
object.handle: string
```

The id of the browser-side reference. Internal, shown for debugging.

### object.call()

```ts
object.call<R>(method: string, ...args: unknown[]): Promise<R>
```

Calls a method by name.

### object.release()

```ts
object.release(): Promise<void>
```

Frees the browser-side reference. Only needed if a test creates very many remote objects; the references are gone with the page anyway.
