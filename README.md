# @ahangl/playwright-ui5

UI5-aware end-to-end testing for [Playwright](https://playwright.dev), inspired by [wdi5](https://ui5-community.github.io/wdi5/):

- **Control API** (any UI5 app): find UI5 controls by selector (`controlType`, `properties`, `bindingPath`, `i18NText`, `ancestor`, ...), call their methods (also as a chain with a single `await`), press, enter text, and get native Playwright `Locator`s. Every call first waits until UI5 is idle (no pending requests, timeouts or rendering).
- **Retrying assertions** (any UI5 app): `await expect(ui5.control(sel)).toHaveUI5Text("Go")` retries until the control matches, like Playwright's locator assertions.
- **SAP Fiori elements V4 test library** (Fiori elements V4 apps only): run the official [`sap.fe.test`](https://ui5.sap.com/#/api/sap.fe.test) page objects (`ListReport`, `ObjectPage`, `Shell`) with typed `Given`/`When`/`Then` chains, directly from Playwright tests.
- **SAP Build Work Zone**: the app is detected automatically in the launchpad iframe. A login provider for SAP IAS saves the session once, and it is reused through Playwright's `storageState`.

Everything except the Fiori elements test library works in any UI5 app: freestyle, Fiori elements V2 or V4. The test library (`fe` fixture) needs Fiori elements V4; V2 (`sap.suite.ui.generic.template`) is not supported yet.

## Install

```bash
npm i -D @ahangl/playwright-ui5 @playwright/test
# optional, gives typed Fiori elements chains and typed control methods:
npm i -D @sapui5/types
```

Requires Node 22 or later and `@playwright/test` 1.60 or later.

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

**https://ahangl.github.io/playwright-ui5/**

- [Installation](https://ahangl.github.io/playwright-ui5/installation), migration from [wdi5](https://ahangl.github.io/playwright-ui5/migration-wdi5) and [OPA](https://ahangl.github.io/playwright-ui5/migration-opa)
- [Running and debugging](https://ahangl.github.io/playwright-ui5/running)
- [Usage](https://ahangl.github.io/playwright-ui5/usage) (control API, chaining, assertions, navigation), [locators](https://ahangl.github.io/playwright-ui5/locators)
- [Authentication](https://ahangl.github.io/playwright-ui5/authentication) (SAP Build Work Zone, IAS)
- [Fiori elements test library](https://ahangl.github.io/playwright-ui5/fe-testlib), with an [overview of the available `sap.fe.test` functions](https://ahangl.github.io/playwright-ui5/api/fe#functions)
- [API reference](https://ahangl.github.io/playwright-ui5/api/): `ui5`, `RemoteControl`, `expect` matchers, `fe`, authentication and [configuration](https://ahangl.github.io/playwright-ui5/configuration)
- [Cookbook](https://ahangl.github.io/playwright-ui5/cookbook) and [known limitations](https://ahangl.github.io/playwright-ui5/limitations)

For AI agents: [`llms.txt`](https://ahangl.github.io/playwright-ui5/llms.txt) and [`llms-full.txt`](https://ahangl.github.io/playwright-ui5/llms-full.txt) (all pages in one file). The sources are in [`docs/`](docs/).

## Development

```bash
npm install
npm test              # builds, then runs the self-tests against the local FE fixture app (mock OData service)
npm run test:workzone # opt-in tests against a real Work Zone site (see .env.example)
npm run typecheck     # builds, then type-checks the sources, the browser bridge and the published types
npm run lint          # ESLint (npm run lint:fix to fix what it can)
npm run format        # Prettier check (npm run format:fix to format)
npm run docs:dev      # docs site with live reload on http://localhost:5173/playwright-ui5/
```

The fixture app in `test/fixture-app` is a Fiori elements V4 List Report + Object Page. It is served by `ui5 serve` with `@sap-ux/ui5-middleware-fe-mockserver` and bootstrapped from the UI5 CDN. `test/fixture-app/webapp/test/iframe.html` hosts it in an iframe to simulate Work Zone.

`test/types/without-sapui5` compiles a consumer that does not install `@sapui5/types`, with `skipLibCheck: false`. The build marks the `sap/*` imports of the published types with `// @ts-ignore` for that (`scripts/mark-optional-types.mjs`).

### Documentation

The site in `docs/` is built with [VitePress](https://vitepress.dev). `vitepress-plugin-llms` generates `llms.txt`, `llms-full.txt` and a `.md` copy of every page.

- `npm run docs:dev`: live preview while writing.
- `npm run docs:build` and `npm run docs:preview`: the production build on http://localhost:4173/playwright-ui5/.
- `npm run docs:deploy`: builds the site and force-pushes it to the `gh-pages` branch, which GitHub Pages serves ("Deploy from a branch", `gh-pages`, `/ (root)`). It needs a clean working tree.

### Releasing

Versions and the changelog are managed with [Changesets](https://github.com/changesets/changesets):

1. Add a changeset for every change that consumers should see: `npx changeset` (choose patch, minor or major and describe the change). Commit it with the change.
2. When you want to release: `npm run version-packages`. It bumps the version in `package.json` and writes `CHANGELOG.md` from the pending changesets.
3. Commit the version bump.
4. `npm run release`. It publishes to npm (public) and creates a git tag. `prepublishOnly` runs lint, the format check and the type check first, which also builds `dist`. With 2FA, add `--otp=<code>`.
5. `git push --follow-tags`.

## License

MIT
