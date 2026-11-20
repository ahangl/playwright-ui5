# fe (Fiori elements V4)

The `fe` fixture runs SAP's test library for Fiori elements V4 apps, [`sap.fe.test`](https://ui5.sap.com/#/api/sap.fe.test). This library adds only `fe.init()`. The functions of the statements (`iPressRow`, `iCheckRows`, ...) are SAP's and documented in the UI5 API reference; the [tables below](#functions) link to the right page.

```ts
const { When, Then } = fe.init({
  onTheMainPage: { ListReport: { appId: "my.books", componentId: "BooksList", contextPath: "/Books" } }
});
await When.onTheMainPage.onTable().iPressRow({ "Book ID": "251" });
```

[Learn more: Fiori elements V4 test library](../fe-testlib)

## fe.init()

```ts
fe.init<P extends FioriElementsPages>(
  pages: P,
  options?: { timeout?: number; waitAfter?: boolean }
): { Given; When; Then }
```

Declares the page objects and returns the roots `Given`, `When` and `Then`. Each has one property per page. Nothing runs in the browser until a statement is awaited, so `fe.init()` can be called before the app is open.

| Option      | Default                                             | Description                                                                 |
| ----------- | --------------------------------------------------- | --------------------------------------------------------------------------- |
| `timeout`   | [`feTimeout`](./configuration#fetimeout) (30000)    | Max. ms per statement.                                                      |
| `waitAfter` | [`feWaitAfter`](./configuration#fewaitafter) (true) | `Given` / `When` statements wait until UI5 is idle after their last action. |

## Page configuration

```ts
type FioriElementsPages = Record<string, FioriElementsPageConfig>;
```

| Page            | Config                                                             |
| --------------- | ------------------------------------------------------------------ |
| List report     | `{ ListReport: { appId, componentId, contextPath?, entitySet? } }` |
| Object page     | `{ ObjectPage: { appId, componentId, contextPath?, entitySet? } }` |
| Launchpad shell | `{ Shell: {} }`                                                    |

- `appId` is `sap.app.id` from the manifest.
- `componentId` is the id of the routing target (`sap.ui5/routing/targets/<target>/id`).
- `contextPath` (e.g. `"/Books"`) or `entitySet` (e.g. `"Books"`) identifies the entity of the page, as in the target's `settings`.
- The page names (`onTheMainPage`, ...) are yours. They become the properties of `Given` / `When` / `Then`.
- `Shell` statements run in the top-level (launchpad) frame, all other pages in the app frame.

These are the settings of SAP's [`ListReport`](https://ui5.sap.com/#/api/sap.fe.test.ListReport) and [`ObjectPage`](https://ui5.sap.com/#/api/sap.fe.test.ObjectPage) constructors. Page extensions (their second argument) aren't supported.

## Statements

```ts
await When.onTheMainPage.onTable().iPressRow({ "Book ID": "251" });
//    ^root ^your page     ^area     ^function
```

- **Root:** `Given` (arrangements), `When` (actions, `i<Do>...`), `Then` (assertions, `iCheck...` / `iSee...`).
- **Page:** a name from `fe.init()`.
- **Area:** `onTable()`, `onFilterBar()`, `onHeader()`, ... Some functions are on the page itself, e.g. `iGoToSection()`.
- **Function:** from the [tables below](#functions).

Behaviour:

- A statement only runs when awaited. Await every statement.
- `.and` continues a statement: `onFilterBar().iChangeFilterField("Author", "Poe").and.iExecuteSearch()`.
- `Given` / `When` statements wait until UI5 is idle after their last action (see `waitAfter`). `Then` statements wait before each check, like OPA.
- A failing statement throws an error with OPA's diagnostics and the last checks that passed. It points at your test line.
- Typed from `@sapui5/types` if it is installed. Without it, any function name compiles, and the statements work the same.

### onTable()

```ts
onTable(table?: string | { property: string; qualifier?: string })
```

Without an argument, the page's only table. Otherwise its header title, or the navigation property and qualifier. An empty object is a type error: it would build the table id `fe::table::undefined::LineItem`.

```ts
await Then.onTheMainPage.onTable().iCheckRows({}, 2);
await When.onTheDetailPage.onTable("Reviews").iExecuteCreate();
await Then.onTheDetailPage.onTable({ property: "reviews" }).iCheckRows({}, 1);
```

## Functions

The functions are SAP's. Each link opens the UI5 API reference with every function of that area. It shows the latest UI5 version; select your app's version in its version switcher if a function is missing.

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

[`sap.fe.test.Shell`](https://ui5.sap.com/#/api/sap.fe.test.Shell): `iNavigateHome()`, `iNavigateBack()`, `iNavigateViaMenu()`, `iOpenNavigationMenu()`, `iPressTile()`, `iCheckIntentBasedNavigation()`. Use them on `When` / `Then` like the other pages. In SAP Build Work Zone, `iNavigateHome()` and `iNavigateBack()` don't work, see [Known limitations](../limitations).
