# Migration from wdi5

playwright-ui5 follows wdi5's concepts: the same selectors, a control API with UI5's own methods, a fluent API, and the Fiori elements test library. The main differences come from the test runner:

- Tests use Playwright's `test` and fixtures instead of WebdriverIO's global `browser`.
- Configuration lives in `playwright.config.ts` under `use.ui5Options`, not in `wdio.conf`.
- The app frame (Work Zone iframe) is detected automatically, so there's no switching and no `btpWorkZoneEnablement`.

## API mapping

| wdi5                                                                                             | playwright-ui5                                                              |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `await browser.asControl({ selector })`                                                          | `await ui5.control(selector)` (the selector is passed directly)             |
| `await browser.asControl({ selector }).getItems(0).getTitle()` (fluent API)                      | `await ui5.control(selector).getItems(0).getTitle()`                        |
| `await browser.allControls({ selector })`                                                        | `await ui5.controls(selector)`                                              |
| `control.press()` / `enterText()`                                                                | same (also chainable: `press().getText()`)                                  |
| `control.getAggregation("items")` / `getItems()`                                                 | same (returns `RemoteControl[]`)                                            |
| `control.getWebElement()` / `$()`                                                                | `control.locator()` (Playwright `Locator`)                                  |
| `selector.interaction`                                                                           | same                                                                        |
| `wdio_ui5_key` / `forceSelect`                                                                   | not needed: a `RemoteControl` is looked up by its id on every call          |
| `expect(await control.getText()).toEqual("Go")`                                                  | same, or retrying: `await expect(control).toHaveUI5Text("Go")`              |
| `browser.goTo({ sHash })`                                                                        | `ui5.goTo("#...")`                                                          |
| `browser.goTo({ oRoute: { sComponentId, sName, oParameters, oComponentTargetInfo, bReplace } })` | `ui5.goTo({ componentId, route, params, componentTargetInfo, replace })`    |
| `wdi5.toWorkZoneShell()` / `wdi5.toWorkZoneApp()`                                                | `ui5.shell.control(...)` / `ui5.control(...)`, no switching needed          |
| `btpWorkZoneEnablement`, `skipInjectUI5OnStart`                                                  | not needed: the app frame is detected and the library is injected on demand |
| `ignoreAutoWaitUrls`                                                                             | `ui5Options.ignoreAutoWaitUrls`                                             |
| `waitForUI5Timeout`                                                                              | `ui5Options.waitForUI5Timeout`                                              |
| `control.exec(function () { return this.getText() })`                                            | `control.exec((control) => control.getText())`, see [exec](#exec)           |
| `control.fireEvent(name, { eval: () => mock })`                                                  | `control.exec(...)`, see [Functions as arguments](#functions-as-arguments)  |
| `browser.screenshot()`                                                                           | Playwright `page.screenshot()` / `screenshot: "only-on-failure"`            |
| `wdi5.getLogger()`                                                                               | `console.log`, Playwright's report steps and trace                          |
| `browser.fe.initialize(pages)` + `execute((Given, When, Then) => ...)`                           | `const { Given, When, Then } = fe.init(pages)`, then `await When...`        |
| `capabilities["wdi5:authentication"]`                                                            | `login(page, { provider: ias() })` in a setup project + `storageState`      |
| `wdi5_username` / `wdi5_password`                                                                | `UI5_USERNAME` / `UI5_PASSWORD` (`credentialsFromEnv(prefix)`)              |

## Porting tests

### exec

In wdi5 the control is `this`, and the arguments start at the first parameter. Here the control is the first parameter, followed by the arguments, so TypeScript can type it:

```ts
// wdi5
await button.exec(function (suffix) {
  return this.getText() + suffix;
}, "!");
// playwright-ui5
await button.exec((control: Button, suffix: string) => control.getText() + suffix, "!");
```

The function runs in the browser. It can't use variables of the test, so pass them as arguments.

### Functions as arguments

Method arguments are sent to the browser as data, so a function can't be an argument. Playwright rejects it with "Attempting to serialize unexpected value". wdi5's `fireEvent` mocks with `eval` become an `exec` that builds the mock in the browser:

```ts
// wdi5
await list.fireEvent("itemPress", { eval: () => ({ listItem: { data: () => "account.relationships" } }) });
// playwright-ui5
await list.exec((l, key) => l.fireItemPress({ listItem: { data: () => key } }), "account.relationships");
```

### Fiori elements test library

```ts
// wdi5
const FioriElementsFacade = await browser.fe.initialize({
  onTheMainPage: { ListReport: { appId, componentId, entitySet } }
});
await FioriElementsFacade.execute((Given, When, Then) => {
  When.onTheMainPage.onFilterBar().iExecuteSearch();
  Then.onTheMainPage.onTable().iCheckRows(5);
});
// playwright-ui5
const { When, Then } = fe.init({ onTheMainPage: { ListReport: { appId, componentId, entitySet } } });
await When.onTheMainPage.onFilterBar().iExecuteSearch();
await Then.onTheMainPage.onTable().iCheckRows({}, 5);
```

Await each statement. A failing statement points at its own line. See [Fiori elements test library](./fe-testlib).
