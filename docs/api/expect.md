# Assertions (expect)

`expect` from this package is Playwright's `expect` with extra matchers for UI5 controls. They work like Playwright's locator assertions:

- Each matcher looks up the control again and retries until the check passes or the `expect` timeout runs out (`expect.timeout` in the Playwright config, default 5 s).
- They support `.not` and `{ timeout }` as the last argument. A control that doesn't exist counts as "no match", so with `.not` it passes.
- The failure message shows the control, the expected value and the last value read.

```ts
import { test, expect } from "@ahangl/playwright-ui5";

await expect(ui5.control(GO_BUTTON)).toBeUI5Enabled();
await expect(ui5.control(GO_BUTTON)).not.toHaveUI5Text("Stop", { timeout: 2_000 });
```

**What to pass:** the chain itself, without `await`: `ui5.control(selector)`, a chain like `ui5.control(TABLE).getItems(0)`, or a `RemoteControl`. A chain is run again on every attempt, a `RemoteControl` is read again. `expect(await control.getText()).toBe("Go")` checks only once.

[Learn more: Assertions](../usage#assertions)

## Matchers

### toHaveUI5Property()

```ts
expect(control).toHaveUI5Property(name: string, expected: unknown, options?: { timeout?: number })
```

The property `name` equals `expected` (deep equality). A RegExp matches string values.

```ts
await expect(ui5.control(INPUT)).toHaveUI5Property("value", "Poe");
await expect(ui5.control(INPUT)).toHaveUI5Property("valueState", /Error|Warning/);
```

### toHaveUI5Text()

```ts
expect(control).toHaveUI5Text(expected: string | RegExp, options?: { timeout?: number })
```

The `text` property equals `expected` or matches the RegExp.

```ts
await expect(ui5.control(GO_BUTTON)).toHaveUI5Text("Go");
```

### toBeUI5Enabled()

```ts
expect(control).toBeUI5Enabled(options?: { timeout?: number })
```

The `enabled` property is `true`. Use `.not` for disabled.

```ts
await expect(ui5.control(SAVE_BUTTON)).not.toBeUI5Enabled();
```

### toBeUI5Visible()

```ts
expect(control).toBeUI5Visible(options?: { timeout?: number })
```

The control is rendered, its `visible` property isn't `false`, and its DOM element is laid out (has a box on the page). `.not.toBeUI5Visible()` passes for a hidden control and for one that doesn't exist.

```ts
await expect(ui5.control({ controlType: "sap.m.Dialog" })).toBeUI5Visible();
```

### toHaveUI5BindingPath()

```ts
expect(control).toHaveUI5BindingPath(expected: string | RegExp, options?: { timeout?: number; modelName?: string })
```

The path of the control's binding context equals `expected` or matches the RegExp. `modelName` picks a named model.

```ts
await expect(ui5.control(TABLE).getItems(0)).toHaveUI5BindingPath("/Books(201)");
```

### toHaveUI5Count()

```ts
expect(ui5.controls(selector)).toHaveUI5Count(expected: number, options?: { timeout?: number })
```

[`ui5.controls(selector)`](./ui5#ui5-controls) finds exactly `expected` controls. This is the way to wait for a number of matches, because `ui5.controls()` itself doesn't wait. It only accepts `ui5.controls()`.

```ts
await expect(ui5.controls({ controlType: "sap.m.ColumnListItem" })).toHaveUI5Count(2);
```

## Playwright's matchers

All of Playwright's matchers still work. For DOM checks, get a locator first:

```ts
await expect(await ui5.locator(GO_BUTTON)).toBeVisible();
await expect(page).toHaveURL(/#Books-display/);
```
