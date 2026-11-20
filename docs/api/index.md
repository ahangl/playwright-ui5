# API reference

The reference lists everything `@ahangl/playwright-ui5` exports: each function, method and option with its signature and a short example. The [guides](../usage) explain the concepts behind them.

```ts
import { test, expect, login, ias } from "@ahangl/playwright-ui5";

test("...", async ({ ui5, fe }) => {
  // ui5: the control API, fe: the Fiori elements V4 test library
});
```

## What do you want to do?

1. **Find a control**: [`ui5.control()`](./ui5#ui5-control), [`ui5.controls()`](./ui5#ui5-controls), [`ui5.controlOrNull()`](./ui5#ui5-controlornull). The selector format is described in [Locators](../locators).
2. **Press it or enter text**: [`press()`](./remote-control#press), [`enterText()`](./remote-control#entertext), or the shortcuts [`ui5.press()`](./ui5#ui5-press) and [`ui5.enterText()`](./ui5#ui5-entertext).
3. **Call its methods or read properties**: [`RemoteControl`](./remote-control) (every public method of the control, plus helpers like [`getProperty()`](./remote-control#getproperty)).
4. **Run code in the browser**: [`ui5.exec()`](./ui5#ui5-exec), [`control.exec()`](./remote-control#exec).
5. **Assert with retries**: the matchers of [`expect`](./expect), e.g. [`toHaveUI5Text()`](./expect#tohaveui5text).
6. **Navigate or wait**: [`ui5.goTo()`](./ui5#ui5-goto), [`ui5.waitForUI5()`](./ui5#ui5-waitforui5).
7. **Use the launchpad shell or frames**: [`ui5.shell`](./ui5#ui5-shell), [`ui5.appFrame()`](./ui5#ui5-appframe).
8. **Run Fiori elements V4 statements**: [`fe.init()`](./fe#fe-init) and the [`sap.fe.test` functions](./fe#functions).
9. **Log in to SAP Build Work Zone**: [`login()`](./auth#login), [`ias()`](./auth#ias).
10. **Configure timeouts and frames**: [`ui5Options`](./configuration).

## Imports

What tests import from `@ahangl/playwright-ui5`:

| Import                               | Use                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `test`                               | Playwright's `test` with the fixtures `ui5` ([reference](./ui5)) and `fe` ([reference](./fe)).    |
| `expect`                             | Playwright's `expect` with the [UI5 matchers](./expect).                                          |
| `login`, `ias`, `credentialsFromEnv` | Log in to SAP Build Work Zone, see [Authentication](./auth).                                      |
| `UI5`                                | The class behind the `ui5` fixture, to use it [without fixtures](./ui5#without-fixtures).         |
| `type UI5TestOptions`                | Types the `ui5Options` in `defineConfig<UI5TestOptions>()`, see [Configuration](./configuration). |
| `type UI5Selector`                   | The type of a [selector](../locators), e.g. for selector constants.                               |
| `type RemoteControl`                 | The type of a [control](./remote-control), e.g. `RemoteControl<Button>`.                          |
| `type AuthProvider`                  | For a [custom identity provider](./auth#authprovider).                                            |

The package exports more types, e.g. for chains and Fiori elements statements. Tests don't need them, because TypeScript infers them.
