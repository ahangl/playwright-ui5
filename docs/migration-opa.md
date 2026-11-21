---
description: "Move OPA5 tests to playwright-ui5: waitFor, actions, matchers, journeys and the Fiori elements test library."
---

# Migration from OPA

OPA5 tests run inside the browser, next to the app, in QUnit. playwright-ui5 tests run in Node.js with Playwright and talk to the app in a real browser. The concepts carry over:

- `waitFor` with matchers becomes a selector (`ui5.control(selector)`). It uses the same matchers underneath (UI5's RecordReplay).
- OPA actions become `press()` and `enterText()`. They are the same OPA actions.
- `autoWait` is always on: every call waits until UI5 is idle. A Fiori elements `Given` / `When` statement also waits after its last action ([`feWaitAfter`](./configuration#fewaitafter)).
- The Fiori elements test library (`sap.fe.test`) is the same. Your page definitions and statements stay almost unchanged.

What changes:

- Tests are `async` functions. Every statement needs `await`.
- Code in the test can't touch UI5 objects directly. Control methods are called remotely (`await input.getValue()`), and code that must run in the browser goes into `exec`.
- The app has to be served over HTTP. Playwright opens it like a user (see [Starting the app](#starting-the-app)).

## Concept mapping

| OPA5                                                          | playwright-ui5                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `opaTest("...", function (Given, When, Then) { ... })`        | `test("...", async ({ ui5, fe }) => { ... })`                                                     |
| `QUnit.module("...")`                                         | `test.describe("...", () => { ... })`                                                             |
| `Given.iStartMyAppInAFrame(url)` / `iStartMyUIComponent(...)` | `await ui5.goTo(url)`                                                                             |
| `Then.iTeardownMyApp()` / `iTeardownMyUIComponent()`          | not needed: every test gets a fresh page                                                          |
| `Opa5.extendConfig({ autoWait: true })`                       | always on                                                                                         |
| `Opa5.extendConfig({ timeout: 15 })` (seconds)                | `ui5Options.waitForUI5Timeout: 15_000` (milliseconds), `feTimeout` for `fe` statements            |
| `Opa5.extendConfig({ viewNamespace })` + `viewName: "Main"`   | full name in the selector: `viewName: "my.app.view.Main"`                                         |
| `this.waitFor({ ..., success })`                              | `const control = await ui5.control(selector)`                                                     |
| `this.waitFor({ ..., actions: new Press() })`                 | `await ui5.control(selector).press()`                                                             |
| `this.waitFor({ ..., actions: new EnterText({ text }) })`     | `await ui5.control(selector).enterText(text)`                                                     |
| `Opa5.assert.strictEqual(control.getText(), "Go")`            | `await expect(ui5.control(selector)).toHaveUI5Text("Go")`                                         |
| `errorMessage: "Go button not found"`                         | `await expect(ui5.control(selector), "Go button not found").toBeUI5Visible()`                     |
| `Opa5.createPageObjects({ onTheMainPage: { ... } })`          | a class or functions that take `ui5`, optionally as a fixture (see [Page objects](#page-objects)) |
| `Opa5.getWindow()`, code in `success`                         | `ui5.exec((...args) => ..., ...args)` or `control.exec(...)`                                      |

## Matchers

Matchers become fields of the selector. See [Locators](./locators) for all fields.

| OPA5 matcher                                                | Selector field / assertion                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `id`, `viewName`, `controlType`                             | same                                                               |
| `new PropertyStrictEquals({ name: "text", value: "Save" })` | `properties: { text: "Save" }`                                     |
| `new Properties({ text: "Save", enabled: true })`           | `properties: { text: "Save", enabled: true }`                      |
| `new BindingPath({ path: "/Books(1)" })`                    | `bindingPath: { path: "/Books(1)" }`                               |
| `new I18NText({ propertyName: "text", key: "SAVE" })`       | `i18NText: { propertyName: "text", key: "SAVE" }`                  |
| `new LabelFor({ text: "Author" })`                          | `labelFor: { text: "Author" }`                                     |
| `new Ancestor(oParent)` / `new Descendant(oChild)`          | `ancestor: { ...selector }` / `descendant: { ...selector }`        |
| `new Sibling(oSibling)`                                     | `sibling: { ...selector }`                                         |
| `new Interactable()`                                        | `interactable: true`                                               |
| `searchOpenDialogs: true`                                   | same                                                               |
| `new AggregationLengthEquals({ name: "items", length: 2 })` | `await expect(ui5.controls(itemSelector)).toHaveUI5Count(2)`       |
| `new AggregationFilled({ name: "items" })`                  | `expect(await ui5.control(TABLE).getItems()).not.toHaveLength(0)`  |
| `new AggregationEmpty({ name: "items" })`                   | `expect(await ui5.control(TABLE).getItems()).toHaveLength(0)`      |
| function matcher `(control) => ...`                         | `(await ui5.controls(selector))` and filter in the test, or `exec` |

`Ancestor`, `Descendant` and `Sibling` take a control instance in OPA. Here they take a selector for that control.

## Actions

| OPA5 action                                 | playwright-ui5                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `new Press()`                               | `control.press()`                                                                                  |
| `new EnterText({ text, clearTextFirst })`   | `control.enterText(text, { clearTextFirst })`                                                      |
| `new Press({ idSuffix: "inner" })`          | `ui5.control({ ...selector, interaction: { idSuffix: "inner" } }).press({ native: true })`         |
| `new Drag()` / `new Drop()`, `new Scroll()` | Playwright on the DOM element: `(await control.locator()).dragTo(...)`, `scrollIntoViewIfNeeded()` |
| `pressEnterKey: true` (EnterText)           | `(await ui5.locator({ ...selector, interaction: "focus" })).press("Enter")`                        |

## Example

```js
// OPA5
// Opa5.extendConfig({ viewNamespace: "my.books.view." });
opaTest("filters books by author", function (Given, When, Then) {
  Given.iStartMyAppInAFrame("index.html");
  When.waitFor({
    viewName: "Main",
    id: "authorInput",
    actions: new EnterText({ text: "Edgar Allan Poe" })
  });
  When.waitFor({
    controlType: "sap.m.Button",
    matchers: new PropertyStrictEquals({ name: "text", value: "Go" }),
    actions: new Press()
  });
  Then.waitFor({
    controlType: "sap.m.Table",
    matchers: new AggregationLengthEquals({ name: "items", length: 2 }),
    success: () => Opa5.assert.ok(true, "two books found")
  });
  Then.iTeardownMyApp();
});
```

```ts
// playwright-ui5
test("filters books by author", async ({ ui5 }) => {
  await ui5.goTo("/index.html");
  await ui5.enterText({ viewName: "my.books.view.Main", id: "authorInput" }, "Edgar Allan Poe");
  await ui5.press({ controlType: "sap.m.Button", properties: { text: "Go" } });
  await expect(ui5.controls({ controlType: "sap.m.ColumnListItem" }), "two books found").toHaveUI5Count(2);
});
```

## Page objects

OPA page objects become a class (or plain functions) that use `ui5`. Register it as a fixture to get it in every test like `ui5`:

```ts
// tests/pages/MainPage.ts
import { expect, type UI5 } from "@ahangl/playwright-ui5";

const GO = { controlType: "sap.m.Button", properties: { text: "Go" } };
const AUTHOR = { viewName: "my.books.view.Main", id: "authorInput" };

export class MainPage {
  constructor(private readonly ui5: UI5) {}

  // actions
  async iSearchForAuthor(author: string) {
    await this.ui5.enterText(AUTHOR, author);
    await this.ui5.press(GO);
  }

  // assertions
  async iSeeBooks(count: number) {
    await expect(this.ui5.controls({ controlType: "sap.m.ColumnListItem" })).toHaveUI5Count(count);
  }
}
```

```ts
// tests/fixtures.ts
import { test as base } from "@ahangl/playwright-ui5";
import { MainPage } from "./pages/MainPage";

export const test = base.extend<{ onTheMainPage: MainPage }>({
  onTheMainPage: async ({ ui5 }, use) => use(new MainPage(ui5))
});
export { expect } from "@ahangl/playwright-ui5";
```

```ts
// tests/books.spec.ts
import { test } from "./fixtures";

test("filters books by author", async ({ ui5, onTheMainPage }) => {
  await ui5.goTo("/index.html");
  await onTheMainPage.iSearchForAuthor("Edgar Allan Poe");
  await onTheMainPage.iSeeBooks(2);
});
```

## Journeys

An OPA journey is a sequence of `opaTest`s that share one app instance: the first test starts the app, the last one tears it down. In Playwright every test gets a fresh page. Either:

- make each test independent (open the app in `test.beforeEach`). This is the recommended way; with `fullyParallel: true` the tests also run in parallel; or
- put the journey into one test and structure it with `test.step`:

```ts
test("create and delete a book", async ({ ui5, fe }) => {
  await ui5.goTo("/index.html");
  await test.step("create", async () => {
    /* ... */
  });
  await test.step("delete", async () => {
    /* ... */
  });
});
```

## Fiori elements test library (`sap.fe.test`)

The page definitions and the statements stay the same. The `JourneyRunner` and the arrangements (`iStartMyApp`, `iTearDownMyApp`) are replaced by `ui5.goTo` and `fe.init`:

```js
// OPA5 with sap.fe.test
const runner = new JourneyRunner({
  launchUrl: sap.ui.require.toUrl("my/books") + "/index.html",
  opaConfig: { timeout: 30 }
});
runner.run(
  {
    pages: {
      onTheMainPage: new ListReport({ appId: "my.books", componentId: "BooksList", contextPath: "/Books" }),
      onTheDetailPage: new ObjectPage({ appId: "my.books", componentId: "BooksObjectPage", contextPath: "/Books" })
    }
  },
  function () {
    opaTest("opens a book", function (Given, When, Then) {
      Given.iStartMyApp();
      When.onTheMainPage.onFilterBar().iExecuteSearch();
      When.onTheMainPage.onTable().iPressRow({ "Book ID": "251" });
      Then.onTheDetailPage.onHeader().iCheckTitle("The Raven");
      Given.iTearDownMyApp();
    });
  }
);
```

```ts
// playwright-ui5
const pages = {
  onTheMainPage: { ListReport: { appId: "my.books", componentId: "BooksList", contextPath: "/Books" } },
  onTheDetailPage: { ObjectPage: { appId: "my.books", componentId: "BooksObjectPage", contextPath: "/Books" } }
} as const;

test.use({ ui5Options: { feTimeout: 30_000 } });

test("opens a book", async ({ ui5, fe }) => {
  await ui5.goTo("/index.html");
  const { When, Then } = fe.init(pages);
  await When.onTheMainPage.onFilterBar().iExecuteSearch();
  await When.onTheMainPage.onTable().iPressRow({ "Book ID": "251" });
  await Then.onTheDetailPage.onHeader().iCheckTitle("The Raven");
});
```

- `new ListReport(definition)` becomes `{ ListReport: definition }`, with the same `appId`, `componentId`, `contextPath` / `entitySet`.
- Await every statement. Chains with `.and` still work.
- Custom page extensions (the second argument of `new ListReport(definition, extension)`) aren't supported. Move them into a page class as shown in [Page objects](#page-objects).
- The functions themselves are SAP's, see the [`fe` reference](./api/fe#functions).

## Starting the app

OPA usually starts the app from a test page in the app (`test/flpSandbox.html`, `test/integration/opaTests.qunit.html`), often with a mock server. Playwright needs a URL:

- Serve the app with the UI5 tooling and let Playwright start it with `webServer`:

  ```ts
  // playwright.config.ts
  export default defineConfig<UI5TestOptions>({
    webServer: {
      command: "npx ui5 serve --port 8080",
      url: "http://localhost:8080/index.html",
      reuseExistingServer: true
    },
    use: { baseURL: "http://localhost:8080" }
  });
  ```

- For mock data, add [`@sap-ux/ui5-middleware-fe-mockserver`](https://www.npmjs.com/package/@sap-ux/ui5-middleware-fe-mockserver) to the `ui5.yaml` that `ui5 serve` uses. Or open the HTML page that already starts your mock server, e.g. `await ui5.goTo("/test/flpSandbox.html#Books-display")`.
- An FLP sandbox page works too: the app iframe or the embedded app is detected automatically.

## Keep or move?

OPA is still the right tool for integration tests that need the app's internals in the same window (mocking modules, stubbing with Sinon, component-level tests). playwright-ui5 fits end-to-end tests: real browsers, real backends or SAP Build Work Zone, login, several apps, and Playwright's reports and traces. Both can live side by side.
