---
description: "Fields, forms, tables and dialogs that the Fiori elements test library doesn't find, with causes and fixes."
---

# Troubleshooting the test library

Problems that come up when you test a Fiori elements V4 app with the `fe` fixture. Most of them are about ids: `sap.fe.test` builds the id of a field, form or table from what you pass, and the statement times out when that id doesn't exist.

The examples use a bookshop app with the pages `onTheMainPage` (list report of Books) and `onTheDetailPage` (object page of a book), as in the [test library guide](./fe-testlib).

## Find the real ids

The ids that `sap.fe.test` looks for end like this:

| Control | Id ends with                                                        |
| ------- | ------------------------------------------------------------------- |
| Field   | `::FormElement::DataField::<property>` (`/` in a path becomes `::`) |
| Form    | `fe::FacetSubSection::<section>`, `fe::FormContainer::<fieldGroup>` |
| Table   | `fe::table::<property>::LineItem`, plus `::<qualifier>`             |
| Header  | `fe::HeaderFacet::Form::<fieldGroup>::DataField::<field>`           |
| Dialog  | `CreateDialog::<EntityType>::<property>`                            |

To see the ids of your app:

- Open the trace (`npx playwright show-trace`), select a step and search the DOM snapshot for `DataField::` or `fe::table::`.
- Or list them from the test:

  ```ts
  const fields = await ui5.controls({ controlType: "sap.ui.mdc.Field" });
  console.log(fields.map((field) => field.id));
  ```

## Fields and forms

### A field of an association isn't found

**Symptom:**

```txt
Then onTheDetailPage.onForm("General Information").iCheckField({"property":"name"}, "Edgar Allan Poe") failed:
Checking field '{property: name}' on form 'General Information' with value 'Edgar Allan Poe' - FAILURE
Opa timeout after 30 seconds
```

**Cause:** the form shows a field of an association, e.g. the author's name on a book. Its id contains the whole path: `...::FormElement::DataField::author::name`. `sap.fe.test` builds the id from `property` and replaces `/` with `::`, so `{ property: "name" }` looks for a different id.

**Fix:** pass the path as in the annotation (`author/name`) or as in the id (`author::name`):

```ts
await Then.onTheDetailPage.onForm("General Information").iCheckField({ property: "author/name" }, "Edgar Allan Poe");
```

The label works in forms, too: `iCheckField("Author", "Edgar Allan Poe")` matches the label of the form element. The [control API](./locators) is different: `labelFor` doesn't find a `sap.ui.mdc.Field`. Select the field by the end of its id there:

```ts
await ui5.control({ controlType: "sap.ui.mdc.Field", id: /::FormElement::DataField::author::name::Field-display$/ });
```

### The property name isn't the label

**Symptom:** as in [A field of an association isn't found](#a-field-of-an-association-isn-t-found).

**Cause:** the ids use the property names of the service. They often differ from the label and aren't simply the label in camel case: the label "Author" can be `author_ID`, "Genre" `genre_code`, "Pages" `pageCount`. A form can also show the same information twice, e.g. `authorName` as read-only text and `author_ID` with a value help in edit mode. These are different fields with different ids.

**Fix:** take the property from the id ([Find the real ids](#find-the-real-ids)), not from the label.

### A field in a header field group isn't found

**Symptom:** the OPA log shows `DataField::undefined`, or `Found no control with the global ID '...--fe::HeaderFacet::Form::Inventory::DataField::stock::Field-content'`.

**Cause:** `onHeader().iCheckFieldInFieldGroup` builds the id from the keys `fieldGroup` and `field`, not `property`. `@sapui5/types` before 1.150 types the argument as a field identifier with `property`; from 1.150 on it's `{ fieldGroup, field }`. The `fieldGroup` is the id part of the field group, including `FieldGroup::`.

**Fix:**

```ts
await Then.onTheDetailPage
  .onHeader()
  .iCheckFieldInFieldGroup({ fieldGroup: "FieldGroup::Inventory", field: "stock" }, "333");
```

`FieldGroup#Inventory` works as well: `sap.fe.test` replaces `#` with `::`. With `@sapui5/types` before 1.150, cast the identifier (`as never`).

### A form without a title isn't found

**Symptom:** `Checking field '...' on form '...' ... - FAILURE` and `Opa timeout`.

**Cause:** `onForm("text")` looks for an object page sub-section with this `title`. A sub-section without a title can't be found by a string.

**Fix:** pass the ids of the sub-section and the field group. They are the `ID` of the facet, or, for a facet without `ID`, derived from its target (`@UI.FieldGroup#Inventory` becomes `FieldGroup::Inventory`):

```ts
await Then.onTheDetailPage
  .onForm({ section: "FieldGroup::Inventory", fieldGroup: "FieldGroup::Inventory" })
  .iCheckField({ property: "stock" }, "333");
```

`iGoToSection("text")` presses the tab with this text in the anchor bar. It fails for a section without a title, and for a page with a single section, which has no anchor bar. A single section is rendered anyway, so skip `iGoToSection` there.

### `Cannot read properties of null (reading 'getModel')`

**Symptom:** `Failure in Opa check function` with `Cannot read properties of null (reading 'getModel')`, in a statement on a field.

**Cause:** this happens for fields in a section below the first screen. The object page renders sections lazily, so the field wasn't rendered yet.

**Fix:** go to the section first:

```ts
await When.onTheDetailPage.iGoToSection("Inventory");
await When.onTheDetailPage.onForm("Inventory").iChangeField({ property: "stock" }, "12");
```

### A typed value stays empty

**Symptom:** `iChangeField` or `iChangeDialogField` passes, but the field is empty afterwards, with the message `The value "..." does not exist.`. Later, Save fails because a mandatory field is empty, or the Create button of a dialog stays inactive.

**Cause:** both functions type the text. A field with a value help resolves the text with a request to the value list, e.g. `$filter=code eq 'en-US'`. A text that isn't an entry leaves the field empty.

**Fix:** type what the app resolves: the key or the description, depending on the field, and spelled exactly like the entry. There is no statement to open the value help of a dialog field. `iOpenValueHelp` exists only for `onForm()` and `onFilterBar()`. In a dialog, use the [control API](./usage).

### `iChangeField` with a number changes nothing

**Symptom:** `iChangeField({ property: "stock" }, 12)` passes, but the field keeps its value and no request is sent.

**Cause:** the value is typed as text. A number isn't typed, and the statement doesn't fail.

**Fix:** pass a string: `iChangeField({ property: "stock" }, String(stock))`. With `@sapui5/types`, a number is a type error.

## Tables

### A table isn't found by its name

**Symptom:** `Checking table 'reviews' ...` and `Opa timeout`.

**Cause:** on an object page, `onTable("text")` matches the table by its header text, not by property. An object identifier matches the table by id: `onTable({ property: "reviews" })` looks for `fe::table::reviews::LineItem`. On a list report, a string is the id part, see [`onTable()`](./api/fe#ontable).

**Fix:**

```ts
await Then.onTheDetailPage.onTable({ property: "reviews" }).iCheckRows({}, 3);
// several tables of one property: add the qualifier (fe::table::reviews::LineItem::Recent)
await Then.onTheDetailPage.onTable({ property: "reviews", qualifier: "Recent" }).iCheckRows({}, 1);
```

Two related errors:

- **`Found no control with ID 'fe::table::undefined::LineItem'`:** the statement passes an empty object, `onTable({})`. In TypeScript that's a type error, but it can happen in JavaScript or behind a cast. On a list report, call `onTable()` without an argument for its only table.
- **`Control '...::LineItem' is not rendered`** on an object page: the tables of a section are created when the section is shown. Call `iGoToSection("Reviews")` first.

### `Cannot read properties of undefined (reading 'isA')` in `iCheckRows`

**Symptom:**

```txt
Then onTheMainPage.onTable().iCheckRows({"Writer":"Edgar Allan Poe"}, 2) failed:
Checking table '{id: fe::table::Books::LineItem}' having 2 rows with values='{Writer: Edgar Allan Poe}' ... - FAILURE
Failure in Opa check function
TypeError: Cannot read properties of undefined (reading 'isA')
```

**Cause:** a key of the row values isn't a column of the table. `sap.fe.test` matches a column by its header text or by its property; for an unknown column it reads a cell that doesn't exist.

**Fix:** use the column header or the property:

```ts
await Then.onTheMainPage.onTable().iCheckRows({ Author: "Edgar Allan Poe" }, 2);
await Then.onTheMainPage.onTable().iCheckRows({ title: "The Raven" }, 1);
```

### `has no focus DOM reference` when changing a row

**Symptom:** `DOM representation of control 'sap.ui.mdc.Field#...' has no focus DOM reference`, from `iChangeRow`.

**Cause:** on a narrow screen, a responsive table shows some columns only in the pop-in, and they are hidden until you show the details. OPA can't type into a field that isn't rendered.

**Fix:**

```ts
await When.onTheDetailPage.onTable("Reviews").iExecuteShowHideDetails(true);
await When.onTheDetailPage.onTable("Reviews").iChangeRow({ Reviewer: "Ann" }, { Comment: "Gripping." }, false);
```

### `iPressRow(0)` in a grouped table

**Symptom:** `iPressRow(0)` times out in a list report grouped by a column, e.g. Books grouped by author.

**Cause:** a row number counts the group headers, and row 0 is a group header. Group headers aren't bound to data, so they never match.

**Fix:** match the row by its values, which skips group headers, or use the number of the first data row:

```ts
await When.onTheMainPage.onTable().iPressRow({ "Book ID": "251" });
await When.onTheMainPage.onTable().iPressRow(1);
```

## Actions and dialogs

### A toolbar button without text can't be pressed

**Symptom:** `iExecuteAction("Upload")` or `iCheckAction("Upload")` times out, although the button is visible.

**Cause:** with a label, both functions look for a control with this `text`. Some toolbar entries have no `text`: the "Upload" entry of an upload table is an `sap.m.upload.ActionsPlaceholder`, and the control it shows is an `sap.ui.unified.FileUploader`.

**Fix:** set the file on the file input of the uploader, without opening the browser's file dialog:

```ts
const uploader = await ui5.locator({ controlType: "sap.ui.unified.FileUploader" });
await uploader.locator('input[type="file"]').setInputFiles("test/files/cover.png");
```

### A create dialog with a "Create" button isn't closed

**Symptom:** `onCreateDialog().iExecuteCreate()` passes, but the dialog stays open. The next statement fails because the page is behind the dialog (`hidden behind a blocking popup layer`).

**Cause:** `iExecuteCreate()` presses the footer button with the text of the SAP resource `C_TRANSACTION_HELPER_SAPFE_ACTION_CREATE_BUTTON_CONTINUE` ("Continue"). If no button has this text, it presses nothing and doesn't fail.

**Fix:** `iConfirm()` presses the first footer button of any dialog:

```ts
await When.onTheDetailPage.onTable("Authors").iExecuteCreate();
await When.onTheDetailPage.onCreateDialog().iChangeDialogField({ property: "BookAuthors/author_ID" }, "101");
await When.onTheDetailPage.onCreateDialog().iConfirm();
```

The fields of a create dialog have ids like `CreateDialog::<EntityType>::<property>`. The entity type is that of the new row, which is often a junction entity (`BookAuthors` for the authors of a book), not the entity set of the page. Pass it as part of `property`. Labels don't work for dialog fields.

## Filter bar

### The table isn't filtered after `iChangeSearchField`

**Cause:** `iChangeSearchField` only types the text. With a Go button, the filter bar searches when you press it.

**Fix:**

```ts
await When.onTheMainPage.onFilterBar().iChangeSearchField("Raven").and.iExecuteSearch();
```

A filter bar in live mode searches without Go and has no Go button. There, `iExecuteSearch()` fails with `DOM representation of control '...FilterBar...' has no element with user-provided ID suffix 'btnSearch'`. Change the search field with the test library, then press Enter in the field:

```ts
await When.onTheMainPage.onFilterBar().iChangeSearchField("Raven");
const search = await ui5.locator({ controlType: "sap.m.SearchField", interaction: "focus" });
await search.press("Enter");
await ui5.waitForUI5();
```

## Pages and timeouts

### `unknown page 'x'`

**Cause:** the page name isn't in the object passed to `fe.init`.

**Fix:** add the page to `fe.init`, or correct the name.

### `iSeeThisPage` times out on a sub-object page

**Cause:** a page object belongs to one page of the app: its `componentId`. Each table whose rows navigate opens a sub-object page with its own component. One page object finds only its own page.

**Fix:** one page object per sub-object page:

```ts
const { When, Then } = fe.init({
  onTheDetailPage: { ObjectPage: { appId: "my.books", componentId: "BooksObjectPage", contextPath: "/Books" } },
  onTheReviewPage: {
    ObjectPage: { appId: "my.books", componentId: "BooksReviewsObjectPage", contextPath: "/Books/reviews" }
  },
  onTheEditionPage: {
    ObjectPage: { appId: "my.books", componentId: "BooksEditionsObjectPage", contextPath: "/Books/editions" }
  }
});
```

Look up the component ids in the `routing.targets` of the app's `manifest.json`.
