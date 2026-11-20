# Fiori elements V4 test library

::: warning Only for Fiori elements V4 apps
The `fe` fixture works only in apps built with the Fiori elements V4 templates (`sap.fe.templates`, OData V4). For freestyle apps and Fiori elements V2 apps, use the [control API](./usage). It works in every UI5 app, see [below](#fiori-elements-v2-and-freestyle-apps).
:::

The `fe` fixture runs SAP's official test library for Fiori elements V4 apps ([`sap.fe.test`](https://ui5.sap.com/#/api/sap.fe.test)) from Playwright tests. It is the counterpart of wdi5's "Test Library Integration".

::: tip Which functions are there?
The functions (`iChangeFilterField`, `iCheckRows`, `iPressRow`, ...) are SAP's, not this library's. They are documented in the UI5 API reference under [**`sap.fe.test`**](https://ui5.sap.com/#/api/sap.fe.test). The [overview below](#available-functions) shows which reference page belongs to which part of a statement.
:::

## Why use the test library?

- The page objects (`ListReport`, `ObjectPage`, `Shell`) know the structure of Fiori elements apps: filter bar, table, header, sections, actions. Tests don't need to know control ids.
- The statements read like the app: `When.onTheMainPage.onFilterBar().iChangeFilterField("Author", "Poe")`.
- They survive UI5 upgrades better than hand-written selectors, because SAP maintains them with Fiori elements.

Use the control API for anything the test library doesn't cover. Both can be mixed in one test.

## Integrating the test library

Prerequisites:

- A Fiori elements app for OData V4. V2 (`sap.suite.ui.generic.template`) is not supported.
- `sap/fe/test` is loaded from the app's own UI5 bootstrap, so its version always matches the app.

```ts
import { test } from "@ahangl/playwright-ui5";

const pages = {
  onTheMainPage: { ListReport: { appId: "my.books", componentId: "BooksList", contextPath: "/Books" } },
  onTheDetailPage: { ObjectPage: { appId: "my.books", componentId: "BooksObjectPage", contextPath: "/Books" } },
  onTheShell: { Shell: {} }
} as const;

test("list report to object page", async ({ ui5, fe }) => {
  await ui5.goTo("/index.html");
  const { When, Then } = fe.init(pages);

  await When.onTheMainPage.onFilterBar().iChangeFilterField("Author", "Edgar Allan Poe").and.iExecuteSearch();
  await Then.onTheMainPage.onTable().iCheckRows({}, 2);
  await When.onTheMainPage.onTable().iPressRow({ "Book ID": "251" });
  await Then.onTheDetailPage.onHeader().iCheckTitle("The Raven");
});
```

### Page configuration

| Page            | Config                                                             |
| --------------- | ------------------------------------------------------------------ |
| List report     | `{ ListReport: { appId, componentId, contextPath?, entitySet? } }` |
| Object page     | `{ ObjectPage: { appId, componentId, contextPath?, entitySet? } }` |
| Launchpad shell | `{ Shell: {} }`                                                    |

- `appId` is `sap.app.id` from the manifest.
- `componentId` is the id of the routing target (`sap.ui5/routing/targets/<target>/id`).
- `contextPath` (e.g. `"/Books"`) or `entitySet` (e.g. `"Books"`) identifies the entity of the page, as in the target's `settings`.
- The page names (`onTheMainPage`, ...) are yours. They become the properties of `Given` / `When` / `Then`.

## Calling test functions

`fe.init(pages, { timeout? })` returns typed `Given` / `When` / `Then` roots:

- Each statement is recorded and only runs when you `await` it. Await every statement.
- Statements can be chained with `.and`, as in OPA.
- A failing statement throws an error. The message contains the statement, OPA's diagnostics and the last checks that passed, and it points at your test line.
- Each statement appears as a step in the Playwright report and trace.
- The timeout per statement is `ui5Options.feTimeout` (default 30 s).

### Naming

The test library follows OPA's naming: actions start with `i<Do>` (`iPressRow`, `iExecuteSearch`) and are called on `When`. Assertions start with `iCheck` / `iSee` and are called on `Then`. `Given` is for arrangements. Open the app with `ui5.goTo` before the first statement.

## Available functions

A statement has three parts: `When` / `Then`, your page name, and the functions of the page or of one of its areas. Each area has its own page in the UI5 API reference:

```ts
await When.onTheMainPage.onTable().iPressRow({ "Book ID": "251" });
//    ^When  ^your page     ^area     ^function: sap.fe.test.api.TableActions
```

The fastest way to find a function:

1. **Editor:** install `@sapui5/types`. The chains are then typed from SAP's typings, and autocompletion after `onTable().` lists every function with its documentation.
2. **API reference:** use the table below, or browse [`sap.fe.test`](https://ui5.sap.com/#/api/sap.fe.test) and its [`api`](https://ui5.sap.com/#/api/sap.fe.test.api) namespace.

### List report (`ListReport`)

| Area              | `When` (actions)                                                                 | `Then` (assertions)                                                                    |
| ----------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| page itself       | [`ListReport.actions`](https://ui5.sap.com/#/api/sap.fe.test.ListReport.actions) | [`ListReport.assertions`](https://ui5.sap.com/#/api/sap.fe.test.ListReport.assertions) |
| `onFilterBar()`   | [`FilterBarActions`](https://ui5.sap.com/#/api/sap.fe.test.api.FilterBarActions) | [`FilterBarAssertions`](https://ui5.sap.com/#/api/sap.fe.test.api.FilterBarAssertions) |
| `onTable(table?)` | [`TableActions`](https://ui5.sap.com/#/api/sap.fe.test.api.TableActions)         | [`TableAssertions`](https://ui5.sap.com/#/api/sap.fe.test.api.TableAssertions)         |
| `onHeader()`      | [`HeaderActionsLR`](https://ui5.sap.com/#/api/sap.fe.test.api.HeaderActionsLR)   | [`HeaderAssertionsLR`](https://ui5.sap.com/#/api/sap.fe.test.api.HeaderAssertionsLR)   |

### Object page (`ObjectPage`)

| Area                     | `When` (actions)                                                                 | `Then` (assertions)                                                                    |
| ------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| page itself              | [`ObjectPage.actions`](https://ui5.sap.com/#/api/sap.fe.test.ObjectPage.actions) | [`ObjectPage.assertions`](https://ui5.sap.com/#/api/sap.fe.test.ObjectPage.assertions) |
| `onHeader()`             | [`HeaderActions`](https://ui5.sap.com/#/api/sap.fe.test.api.HeaderActions)       | [`HeaderAssertions`](https://ui5.sap.com/#/api/sap.fe.test.api.HeaderAssertions)       |
| `onForm(form)`           | [`FormActions`](https://ui5.sap.com/#/api/sap.fe.test.api.FormActions)           | [`FormAssertions`](https://ui5.sap.com/#/api/sap.fe.test.api.FormAssertions)           |
| `onTable(table?)`        | [`TableActions`](https://ui5.sap.com/#/api/sap.fe.test.api.TableActions)         | [`TableAssertions`](https://ui5.sap.com/#/api/sap.fe.test.api.TableAssertions)         |
| `onFooter()`             | [`FooterActionsOP`](https://ui5.sap.com/#/api/sap.fe.test.api.FooterActionsOP)   | [`FooterAssertionsOP`](https://ui5.sap.com/#/api/sap.fe.test.api.FooterAssertionsOP)   |
| `onFilterBar(filterBar)` | [`FilterBarActions`](https://ui5.sap.com/#/api/sap.fe.test.api.FilterBarActions) | [`FilterBarAssertions`](https://ui5.sap.com/#/api/sap.fe.test.api.FilterBarAssertions) |

### Dialogs (both page types)

| Area                                                                                | `When` (actions)                                                                             | `Then` (assertions)                                                                                |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `onDialog(dialog)`, `onActionDialog()`, `onConfirmationDialog()`, `onErrorDialog()` | [`DialogActions`](https://ui5.sap.com/#/api/sap.fe.test.api.DialogActions)                   | [`DialogAssertions`](https://ui5.sap.com/#/api/sap.fe.test.api.DialogAssertions)                   |
| `onCreateDialog()`                                                                  | [`DialogCreateActions`](https://ui5.sap.com/#/api/sap.fe.test.api.DialogCreateActions)       | [`DialogCreateAssertions`](https://ui5.sap.com/#/api/sap.fe.test.api.DialogCreateAssertions)       |
| `onMessageDialog()`                                                                 | [`DialogMessageActions`](https://ui5.sap.com/#/api/sap.fe.test.api.DialogMessageActions)     | [`DialogMessageAssertions`](https://ui5.sap.com/#/api/sap.fe.test.api.DialogMessageAssertions)     |
| `onValueHelpDialog()`                                                               | [`DialogValueHelpActions`](https://ui5.sap.com/#/api/sap.fe.test.api.DialogValueHelpActions) | [`DialogValueHelpAssertions`](https://ui5.sap.com/#/api/sap.fe.test.api.DialogValueHelpAssertions) |

### Launchpad (`Shell`)

[`sap.fe.test.Shell`](https://ui5.sap.com/#/api/sap.fe.test.Shell): `iNavigateHome()`, `iNavigateBack()`, `iNavigateViaMenu()`, `iOpenNavigationMenu()`, `iPressTile()`, `iCheckIntentBasedNavigation()`. Use them on `When` / `Then` like the other pages. In SAP Build Work Zone some of them don't work, see [below](#sap-build-work-zone).

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
await When.onTheDetailPage.iGoToSection("Recipients"); // also renders the tables of that section
await When.onTheDetailPage.onTable("Recipients").iExecuteCreate();
```

`.and.iExecuteSearch()` presses the **Go** button of the filter bar. A filter bar in live mode has no Go button, see [Troubleshooting](#troubleshooting).

Notes on the typings and arguments:

- Without `@sapui5/types` the chains are untyped, but they work the same.
- SAP's typings are sometimes stricter than the runtime. For example, `iCheckRows(5)` is typed as `iCheckRows({}, 5)`.
- **`onTable()` without an argument** uses the page's default table. A list report with one table needs no identifier. Don't pass an empty object: `onTable({})` builds the table id `fe::table::undefined::LineItem`, and the statement times out with `Found no control with ID 'fe::table::undefined::LineItem'`.

  `@sapui5/types` before 1.150 declares the identifier as required. Update the typings (their version is independent of the UI5 version your app runs), or mark the call:

  ```ts
  await Then.onTheMainPage.onTable().iCheckRows({}, 2); // @sapui5/types 1.150 or later

  // @sapui5/types before 1.150:
  // @ts-expect-error -- the identifier is optional at runtime
  await Then.onTheMainPage.onTable().iCheckRows({}, 2);
  ```

- **`iCheckTitle(title, description?)`** compares the whole text, not a part of it. Omit the description or pass `undefined` to skip it. `iCheckTitle(title, "")` fails when the header has no description. For a partial match, use the control API:

  ```ts
  await Then.onTheDetailPage.onHeader().iCheckTitle("The Raven"); // whole title, description not checked

  // title contains "Raven"
  await expect(
    ui5.control({
      controlType: "sap.m.Label",
      ancestor: { controlType: "sap.uxap.ObjectPageDynamicHeaderTitle" },
      properties: { text: /Raven/ }
    })
  ).toBeUI5Visible();
  ```

- The API reference shows the functions of the UI5 version on ui5.sap.com. Your app may run an older version. Select it in the version switcher of the API reference if a function is missing.

## Combining with the control API

```ts
await When.onTheMainPage.onFilterBar().iChangeSearchField("Raven").and.iExecuteSearch();
await Then.onTheMainPage.onTable().iCheckRows({}, 1);
expect(await ui5.controls({ controlType: "sap.m.ColumnListItem" })).toHaveLength(1);
await ui5.press({ controlType: "sap.m.Button", properties: { text: "Go" } });
```

## Fiori elements V2 and freestyle apps

There are no page objects for these apps. Use the [control API](./usage) and the [UI5 assertions](./usage#assertions):

- Find the controls and their types with the UI5 Inspector browser extension, or with `control.className` and `control.methods` (see [Inspecting controls](./running#inspecting-controls)).
- Fiori elements V2 apps are built from smart controls such as `sap.ui.comp.smartfilterbar.SmartFilterBar` and `sap.ui.comp.smarttable.SmartTable`. The table inside a smart table is usually an `sap.m.Table` or an `sap.ui.table.Table`.
- Select controls by `bindingPath`, `labelFor` or `i18NText` rather than by generated ids (see [Locators](./locators)).

## SAP Build Work Zone

Nothing special is needed: `Shell` statements run in the launchpad (top-level) frame, all other pages in the app iframe. The page objects are created in whichever frame the statement runs in.

The `Shell` actions `iNavigateHome()` and `iNavigateBack()` don't work with the Work Zone shell bar. Navigate with `ui5.goTo("#Shell-home")` or `ui5.goTo("#Intent-action")` instead. See [Known limitations](./limitations).

## How it works

The library injects a small bridge into the app frame. The bridge creates the `sap.fe.test` page objects with `Opa5.createPageObjects`, queues your statement and runs `Opa.emptyQueue()`. This is the same approach as wdi5's integration.

## Troubleshooting

- **`unknown page 'x'`**: the page name isn't in the object passed to `fe.init`.
- **A table or field isn't found:** check `componentId` and `contextPath` / `entitySet` against the manifest. A List Report with several table views (different entity sets per tab) can't be addressed with one page config. Use the control API for the other tabs, see [Recipes](./recipes#list-report-with-several-table-views).
- **`Found no control with ID 'fe::table::undefined::LineItem'`:** the statement uses `onTable({})`. Call `onTable()` without an argument, see [Notes on the typings and arguments](#frequently-used).
- **`DOM representation of control '...FilterBar...' has no element with user-provided ID suffix 'btnSearch'`:** `iExecuteSearch()` looks for the Go button, but the filter bar runs in live mode and has none. Change the search field and press Enter instead, see [Recipes](./recipes#search-in-a-filter-bar-without-a-go-button).
- **`Control '...::LineItem' is not rendered`** on an object page, e.g. for `onTable("Recipients").iExecuteCreate()`: the tables of an object page section are created when the section is shown. Go to the section first:

  ```ts
  await When.onTheDetailPage.iGoToSection("Recipients");
  await When.onTheDetailPage.onTable("Recipients").iExecuteCreate();
  ```

- **Timeouts:** increase `ui5Options.feTimeout` or pass `fe.init(pages, { timeout })`.
