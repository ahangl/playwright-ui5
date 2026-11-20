# Installation

## Requirements

- Node.js 22 or later
- `@playwright/test` 1.60 or later
- A UI5 application (standalone, in a launchpad or in SAP Build Work Zone). The Fiori elements test library needs an OData V4 Fiori elements app.

## Install the packages

```bash
npm i -D @ahangl/playwright-ui5 @playwright/test
npx playwright install chromium
```

Optional: SAP's UI5 typings give you typed control methods and typed Fiori elements chains. Without them everything works the same, but untyped.

```bash
npm i -D @sapui5/types
```

Any version of `@sapui5/types` works. It doesn't have to match the UI5 version your app runs; newer typings describe the APIs more accurately.

## Configure Playwright

Point `baseURL` at your app. Add `ui5Options` only where you need to change the defaults (see [Configuration](./configuration)).

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";
import type { UI5TestOptions } from "@ahangl/playwright-ui5";

export default defineConfig<UI5TestOptions>({
  testDir: "tests",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:8080",
    trace: "retain-on-failure"
  }
});
```

## Write the first test

Import `test` and `expect` from `@ahangl/playwright-ui5` instead of `@playwright/test`. Then the tests get the `ui5` and `fe` fixtures and the UI5 matchers.

### Any UI5 app

The control API and the assertions work in every UI5 app: freestyle, Fiori elements V2 or V4, standalone, in a launchpad or in SAP Build Work Zone.

```ts
// tests/books.spec.ts
import { test, expect } from "@ahangl/playwright-ui5";
import type Table from "sap/m/Table";

test("search books", async ({ ui5 }) => {
  await ui5.goTo("/index.html");

  // Control API, the counterpart of wdi5's browser.asControl()
  await ui5.enterText({ controlType: "sap.m.Input", labelFor: { text: "Author" } }, "Edgar Allan Poe");
  await ui5.press({ controlType: "sap.m.Button", properties: { text: "Go" } });

  // retrying UI5 assertions
  await expect(ui5.controls({ controlType: "sap.m.ColumnListItem" })).toHaveUI5Count(2);

  // call control methods, also as a chain with a single await
  const title = await ui5
    .control<Table>({ controlType: "sap.m.Table" })
    .getItems(0)
    .getBindingContext()!
    .getProperty("title");
  expect(title).toBe("The Raven");
});
```

### Fiori elements V4 app

For Fiori elements V4 apps, the `fe` fixture adds SAP's test library with page objects for the list report and the object page. You can mix it with the control API in the same test.

```ts
// tests/books-fe.spec.ts
import { test } from "@ahangl/playwright-ui5";

const pages = {
  onTheMainPage: { ListReport: { appId: "my.books", componentId: "BooksList", contextPath: "/Books" } },
  onTheDetailPage: { ObjectPage: { appId: "my.books", componentId: "BooksObjectPage", contextPath: "/Books" } }
} as const;

test("open a book", async ({ ui5, fe }) => {
  await ui5.goTo("/index.html");
  const { When, Then } = fe.init(pages);

  await When.onTheMainPage.onFilterBar().iChangeFilterField("Author", "Edgar Allan Poe").and.iExecuteSearch();
  await Then.onTheMainPage.onTable().iCheckRows({}, 2);
  await When.onTheMainPage.onTable().iPressRow({ "Book ID": "251" });
  await Then.onTheDetailPage.onHeader().iCheckTitle("The Raven");
});
```

Run it with `npx playwright test`. See [Running and debugging](./running).

The Fiori elements functions (`iChangeFilterField`, `iCheckRows`, ...) come from SAP's `sap.fe.test` library. See [Available functions](./fe-testlib#available-functions) for where to find them.

## TypeScript

- Pass the UI5 class as a type parameter for typed methods: `ui5.control<Input>({...})` with `import type Input from "sap/m/Input"` (needs `@sapui5/types`).
- The published types compile without `@sapui5/types` too, also with `skipLibCheck: false`.
- Enable the ESLint rule [`@typescript-eslint/no-floating-promises`](https://typescript-eslint.io/rules/no-floating-promises/). Chains only run when awaited, so a forgotten `await` silently does nothing.
