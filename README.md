# @ahangl/playwright-ui5

UI5-aware end-to-end testing for [Playwright](https://playwright.dev), inspired by [wdi5](https://ui5-community.github.io/wdi5/).

- **Control API:** find UI5 controls with wdi5/OPA selectors, call their methods (also as a chain with a single `await`), press, and enter text. Every call waits until UI5 is idle.
- **Retrying assertions:** `await expect(ui5.control(sel)).toHaveUI5Text("Go")`, like Playwright's locator assertions.
- **Fiori elements V4 test library:** run SAP's [`sap.fe.test`](https://ui5.sap.com/#/api/sap.fe.test) page objects with typed `Given`/`When`/`Then` statements.
- **SAP Build Work Zone:** finds the app iframe automatically. A login provider for SAP IAS logs in once and reuses the session in all tests.

Everything except the test library works in any UI5 app. The test library needs Fiori elements V4.

## Install

```bash
npm i -D @ahangl/playwright-ui5 @playwright/test
# optional, for typed control methods and Fiori elements statements:
npm i -D @sapui5/types
```

Requires Node.js 22 and `@playwright/test` 1.60 or later.

## Quick start

Any UI5 app:

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

Fiori elements V4 app, with SAP's test library:

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

## Documentation

**https://ahangl.github.io/playwright-ui5/**: [installation](https://ahangl.github.io/playwright-ui5/installation), migration from [wdi5](https://ahangl.github.io/playwright-ui5/migration-wdi5) and [OPA](https://ahangl.github.io/playwright-ui5/migration-opa), [Test library integration](https://ahangl.github.io/playwright-ui5/fe-testlib), and the [API reference](https://ahangl.github.io/playwright-ui5/api/).

For AI agents: [`llms.txt`](https://ahangl.github.io/playwright-ui5/llms.txt) and [`llms-full.txt`](https://ahangl.github.io/playwright-ui5/llms-full.txt).

## Development

```bash
npm install
npm test              # self-tests against the fixture app (Fiori elements V4, mock OData)
npm run test:workzone # opt-in tests against a real Work Zone site, see .env.example
npm run typecheck     # sources, browser bridge, and published types
npm run lint          # ESLint; lint:fix to fix
npm run format        # Prettier; format:fix to fix
npm run docs:dev      # docs on http://localhost:5173/playwright-ui5/
```

- `test/fixture-app` is served by `ui5 serve` with `@sap-ux/ui5-middleware-fe-mockserver`. Its `webapp/test/iframe.html` simulates Work Zone.
- `test/types/without-sapui5` checks that the published types compile without `@sapui5/types` (see `scripts/mark-optional-types.mjs`).
- The docs in `docs/` use [VitePress](https://vitepress.dev). `.github/workflows/docs.yml` deploys them to GitHub Pages on every push to `main` that changes them.

### Releasing

Versions and the changelog are managed with [Changesets](https://github.com/changesets/changesets). Log in with `npm login` first.

1. For every change that users should see, run `npx changeset` and commit the changeset with the change.
2. To release, run `npm run version-packages` and commit the version bump and `CHANGELOG.md`.
3. Run `npm run release`. It runs lint, format, and typecheck, publishes to npm, and creates a git tag. With an authenticator app, add `-- --otp=<code>`.
4. Run `git push --follow-tags`.

## License

MIT
