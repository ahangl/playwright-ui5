# RemoteControl

A `RemoteControl` represents a UI5 control in the browser. You get one by awaiting [`ui5.control()`](./ui5#ui5-control), from [`ui5.controls()`](./ui5#ui5-controls), or as the return value of a control method. It is looked up by its id on every call, so it stays valid across re-rendering.

```ts
import type Input from "sap/m/Input";

const input = await ui5.control<Input>({ controlType: "sap.m.Input", labelFor: { text: "Author" } });
await input.enterText("Poe");
const value = await input.getValue(); // any public method of the control
```

A `RemoteControl` has:

- every public method of the control (typed if you pass the UI5 class as type parameter),
- the properties and helpers below.

[Learn more: Usage](../usage#remotecontrol)

## Control methods

```ts
control.<method>(...args): UI5Chain<R>
```

Every public method of the control runs in the browser and returns a promise. Without `await` it is a [chain](#chains).

- Controls come back as `RemoteControl`s, arrays of controls as `RemoteControl[]`.
- Other UI5 objects (binding contexts, models, ...) come back as [remote objects](#remote-objects).
- Plain values (strings, numbers, arrays, plain objects, dates) come back as values.
- Arguments can be plain values, RegExps, `RemoteControl`s and remote objects. Functions can't be arguments, see [Recipes](../recipes#mock-event-parameters).
- Aggregation getters take an index, as in wdi5: `table.getItems(0)` returns the first item.

```ts
await input.setValue("Poe");
const items = await table.getItems(); // RemoteControl[]
const first = await table.getItems(0); // RemoteControl
await parent.indexOfAggregation("content", go);
```

Typing: `ui5.control<Input>(...)` with `import type Input from "sap/m/Input"` types every method from `@sapui5/types`. Without a type parameter, any method name compiles and returns `any` when awaited.

## Properties

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

## Helpers

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

A Playwright `Locator` for the control's root DOM element, e.g. for screenshots or Playwright's own matchers. [`ui5.locator()`](./ui5#ui5-locator) with [`interaction`](../locators#interaction) gives other elements of the control.

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

## Actions

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
