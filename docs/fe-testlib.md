---
description: "Run SAP's Fiori elements V4 test library (sap.fe.test) from Playwright tests with the fe fixture."
---

# Test library (sap.fe.test)

::: warning Only for Fiori elements V4 apps
The `fe` fixture works only in apps built with the Fiori elements V4 templates (`sap.fe.templates`, OData V4). For freestyle apps and Fiori elements V2 apps, use the [control API](./usage), which works in every UI5 app ([more](#fiori-elements-v2-and-freestyle-apps)).
:::

The `fe` fixture runs SAP's official test library for Fiori elements V4 apps ([`sap.fe.test`](https://ui5.sap.com/#/api/sap.fe.test)) from Playwright tests. It is the counterpart of wdi5's "Test Library Integration".

## Why use the test library?

- The page objects (`ListReport`, `ObjectPage`, `Shell`) know the structure of Fiori elements apps: filter bar, table, header, sections, actions. Tests don't need to know control ids.
- The statements read like the app: `When.onTheMainPage.onFilterBar().iChangeFilterField("Author", "Poe")`.
- They survive UI5 upgrades better than hand-written selectors, because SAP maintains them with Fiori elements.

Use the control API for anything the test library doesn't cover. Both can be mixed in one test.

## Integrate the test library

Prerequisites:

- `sap/fe/test` is loaded from the app's own UI5 bootstrap, so its version always matches the app.

Declare the pages once, open the app and call `fe.init` in a `test.beforeEach` hook, and use the returned `Given` / `When` / `Then` in the tests:

```ts
import { test, type FioriElementsJourney } from "@ahangl/playwright-ui5";

const pages = {
  onTheMainPage: { ListReport: { appId: "my.books", componentId: "BooksList", contextPath: "/Books" } },
  onTheDetailPage: { ObjectPage: { appId: "my.books", componentId: "BooksObjectPage", contextPath: "/Books" } },
  onTheShell: { Shell: {} }
} as const;

test.describe("books app", () => {
  let FioriElementsFacade: FioriElementsJourney<typeof pages>;

  test.beforeEach(async ({ ui5, fe }) => {
    FioriElementsFacade = fe.init(pages);
  });

  test("list report to object page", async () => {
    const { When, Then } = FioriElementsFacade;
    await When.onTheMainPage.onFilterBar().iChangeFilterField("Author", "Edgar Allan Poe").and.iExecuteSearch();
    await Then.onTheMainPage.onTable().iCheckRows({}, 2);
    await When.onTheMainPage.onTable().iPressRow({ "Book ID": "251" });
    await Then.onTheDetailPage.onHeader().iCheckTitle("The Raven");
  });
});
```

- Use `test.beforeEach`, not `test.beforeAll`. Like wdi5's `before`, the hook prepares the page objects, but in Playwright every test gets a fresh page, and the `fe` fixture belongs to that page.
- `fe.init` doesn't run anything in the browser. The statements run when you await them, in the test.
- For a single test, call `fe.init` in the test itself: `const { When, Then } = fe.init(pages);`.

### Page configuration

Each page is `{ ListReport | ObjectPage | Shell: settings }`. `appId` is `sap.app.id` from the manifest, `componentId` the id of the routing target, and `contextPath` or `entitySet` the entity of the page. The page names (`onTheMainPage`, ...) are yours. All fields: [Page configuration](./api/fe#page-configuration).

## Call test functions

`fe.init(pages, { timeout?, waitAfter? })` returns typed `Given` / `When` / `Then` roots. Open the app with `ui5.goTo` before the first statement.

- Each statement is recorded and only runs when you `await` it. Await every statement.
- Statements can be chained with `.and`, as in OPA.
- A `When` statement waits until UI5 is idle after its last action (so does `Given`). After `await When.onTheDetailPage.onFooter().iExecuteSave()` the object is saved, and the next step, also a Playwright locator, sees the result. `{ waitAfter: false }` or [`ui5Options.feWaitAfter`](./configuration#fewaitafter) turns it off. `Then` statements wait before each check, like OPA.
- A failing statement throws an error. The message contains the statement, OPA's diagnostics, and the last OPA log entries, and it points at your test line.
- Each statement appears as a step in the Playwright report and trace.
- The timeout per statement is `ui5Options.feTimeout` (default 30 s).

### Naming

The test library follows OPA's naming: actions start with `i<Do>` (`iPressRow`, `iExecuteSearch`) and are called on `When`. Assertions start with `iCheck` / `iSee` and are called on `Then`. `Given` is for arrangements.

## Available functions

A statement has four parts: `When` / `Then`, your page name, an area of the page such as `onTable()`, and the function ([details](./api/fe#statements)). Each area has its own page in the UI5 API reference, for example, `onTable()` on `When` is [`TableActions`](https://ui5.sap.com/#/api/sap.fe.test.api.TableActions).

The fastest way to find a function:

1. **Editor:** install `@sapui5/types`. The chains are then typed from SAP's typings, and autocompletion after `onTable().` lists every function with its documentation.
2. **API reference:** the [tables in the `fe` reference](./api/fe#functions) link each area to its SAP reference page. Or browse [`sap.fe.test`](https://ui5.sap.com/#/api/sap.fe.test) and its [`api`](https://ui5.sap.com/#/api/sap.fe.test.api) namespace.

### Frequently used

```ts
// List report: filter bar (iExecuteSearch presses the Go button)
await When.onTheMainPage.onFilterBar().iChangeFilterField("Author", "Poe").and.iExecuteSearch();
await When.onTheMainPage.onFilterBar().iChangeSearchField("Raven").and.iExecuteSearch();

// List report: table
await Then.onTheMainPage.onTable().iCheckRows({}, 2); // number of rows
await Then.onTheMainPage.onTable().iCheckRows({ "Book ID": "251" }, 1); // rows with these column values
await When.onTheMainPage.onTable().iPressRow({ "Book ID": "251" }); // open a row

// Object page
await Then.onTheDetailPage.iSeeThisPage();
await Then.onTheDetailPage.onHeader().iCheckTitle("The Raven");
await When.onTheDetailPage.iGoToSection("Reviews"); // also renders the tables of that section
await When.onTheDetailPage.onTable("Reviews").iExecuteCreate();
```

A filter bar in live mode has no **Go** button for `iExecuteSearch()`, see [Troubleshooting](./fe-troubleshooting#the-table-isn-t-filtered-after-ichangesearchfield).

Notes on the typings and arguments:

- Without `@sapui5/types` the chains are untyped: any function name compiles, and they work the same. Only `onTable()` is typed (see below).
- SAP's typings are sometimes stricter than the runtime. For example, `iCheckRows(5)` works at runtime but is a type error; write `iCheckRows({}, 5)`.
- **`onTable(table?)`**: on a list report with one table, call it without an argument. On an object page, pass the table's header title or `{ property, qualifier? }`. Details: [`onTable()`](./api/fe#ontable).

- **`iCheckTitle(title, description?)`** compares the whole text, not a part of it. Omit the description or pass `undefined` to skip it. `iCheckTitle(title, "")` fails when the header has no description. For a partial match, use the control API:

  ```ts
  await Then.onTheDetailPage.onHeader().iCheckTitle("The Raven"); // whole title, description not checked

  // title contains "Raven"
  await expect(
    ui5.control({
      controlType: "sap.m.Title",
      ancestor: { controlType: "sap.uxap.ObjectPageDynamicHeaderTitle" },
      properties: { text: /Raven/ }
    })
  ).toBeUI5Visible();
  ```

## Combine with the control API

```ts
await When.onTheMainPage.onFilterBar().iChangeSearchField("Raven").and.iExecuteSearch();
await expect(ui5.controls({ controlType: "sap.m.ColumnListItem" })).toHaveUI5Count(1); // control API
await ui5.press({ controlType: "sap.m.Button", properties: { text: "Export" } }); // a custom action
```

## Fiori elements V2 and freestyle apps

There are no page objects for these apps. Use the [control API](./usage) and the [UI5 assertions](./usage#assertions):

- Find the controls and their types with the UI5 Inspector browser extension, or with `control.className` and `control.methods` (see [Inspecting controls](./running#inspect-controls)).
- Fiori elements V2 apps are built from smart controls such as `sap.ui.comp.smartfilterbar.SmartFilterBar` and `sap.ui.comp.smarttable.SmartTable`. The table inside a smart table is usually an `sap.m.Table` or an `sap.ui.table.Table`.
- Select controls by `bindingPath`, `labelFor`, or `i18NText` rather than by generated ids (see [Locators](./locators)).

## SAP Build Work Zone

Nothing special is needed: `Shell` statements run in the top-level frame (the Work Zone shell), all other pages in the app iframe. The page objects are created in whichever frame the statement runs in.

The `Shell` actions `iNavigateHome()` and `iNavigateBack()` don't work with the Work Zone shell bar: they look for elements of the classic launchpad header. Navigate with `ui5.goTo("#Shell-home")` or `ui5.goTo("#Intent-action")` instead. See [Known limitations](./limitations).

## How it works

The library injects a small bridge into the app frame. The bridge creates the `sap.fe.test` page objects with `Opa5.createPageObjects`, queues your statement, and runs `Opa.emptyQueue()`.

## Troubleshooting

Fields, forms, or tables that aren't found, dialogs that stay open, and other problems: see [Troubleshooting the test library](./fe-troubleshooting).
