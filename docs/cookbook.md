---
description: "Short solutions for common tasks: Work Zone navigation, keyboard input, downloads, several users and more."
---

# Cookbook

## Ignore requests that never finish

Long polling, push channels or notification polling never finish, so every call waits for them until `waitForUI5Timeout` runs out. Ignore them:

```ts
// playwright.config.ts, or test.use(...) in a test file
export default defineConfig<UI5TestOptions>({
  use: { ui5Options: { ignoreAutoWaitUrls: [/\/longpoll/, "notifications\\?"] } }
});
```

Details: [`ignoreAutoWaitUrls`](./configuration#ignoreautowaiturls).

## Navigate in SAP Build Work Zone

```ts
await ui5.goTo("/site/my-site#Shell-home"); // open the site
await ui5.goTo("#SalesOrder-manage"); // intent navigation, only changes the hash
await ui5.control({ controlType: "sap.m.Button", properties: { text: "Go" } }).press(); // in the app iframe
await ui5.goTo("#Shell-home"); // back to the home page
```

The app frame is detected again after each navigation. For the shell bar, use [`ui5.shell`](./usage#launchpad-and-work-zone-shell).

## Send keyboard events

Get a Playwright locator for the control's inner element and use Playwright's keyboard API:

```ts
const input = await ui5.locator({ controlType: "sap.m.Input", labelFor: { text: "Author" }, interaction: "focus" });
await input.press("Enter");
await input.press("Control+A");
```

## Type like a user

`enterText()` sets the text the way OPA does (focus, type, fire change). For per-key events (suggestions, live search) type natively:

```ts
const input = await ui5.locator({ controlType: "sap.m.SearchField", interaction: "focus" });
await input.pressSequentially("Poe", { delay: 50 });
```

## Mock event parameters

Functions can't be passed as arguments to control methods, because arguments are sent to the browser as data. Build the event parameters inside `exec`:

```ts
await list.exec((l, key) => l.fireItemPress({ listItem: { data: () => key } }), "account.relationships");
```

## Read values of a table row

```ts
import type Table from "sap/m/Table";

const TABLE = { controlType: "sap.m.Table" };
const path = await ui5.control<Table>(TABLE).getItems(0).getBindingContextPath();
const title = await ui5.control<Table>(TABLE).getItems(0).getBindingContext()!.getProperty("title");

// one specific row
const row = await ui5.control({ controlType: "sap.m.ColumnListItem", bindingPath: { path: "/Books(251)" } });
```

## Assert a file download

```ts
const download = page.waitForEvent("download");
await ui5.press({ controlType: "sap.m.Button", properties: { text: "Export" } });
expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
```

## Combine with your own matchers

```ts
import { mergeExpects } from "@playwright/test";
import { expect as ui5Expect } from "@ahangl/playwright-ui5";
import { expect as myExpect } from "./my-matchers";

export const expect = mergeExpects(ui5Expect, myExpect);
```

## Ask a yes/no question without a long wait

`fe.init(pages, { timeout })` sets the timeout of the roots it returns. A second set of roots with a short timeout answers a question quickly:

```ts
const probe = fe.init(pages, { timeout: 2_000 });
const noBooks = await probe.Then.onTheMainPage
  .onTable()
  .iCheckRows({}, 0)
  .then(
    () => true,
    () => false
  );
```

A statement that returns `false` here still shows as a failed step in the report and the trace.

## List report with several table views

A list report with several table views (tabs of an `sap.m.IconTabBar`, one table per tab, table ids with a qualifier) can't be addressed with `onTable()`. Use the control API for the tabs and the rows:

```ts
const TAB_BAR = { controlType: "sap.m.IconTabBar" };

// switch to a tab and check that it is selected
await ui5.press({ controlType: "sap.m.IconTabFilter", properties: { text: /^Archived/ } });
await expect(ui5.control(TAB_BAR)).toHaveUI5Property("selectedKey", "archived");

// rows of the selected tab: only the table of the selected tab is rendered
await expect(ui5.controls({ controlType: "sap.m.ColumnListItem" })).toHaveUI5Count(3);
```

- Look up the tab keys and the table ids (`...::LineItem::<qualifier>`) with the UI5 Inspector.
- To address one table directly, select it by its id, e.g. `ui5.control({ id: /::LineItem::Archived$/ })`.
- The rows are the rendered rows. A growing table renders only its first page.

## Several users

Log in once per user in the setup project and pick the session per project or file:

```ts
await login(page, { url, credentials: credentialsFromEnv("ADMIN"), storageStatePath: ".auth/admin.json" });

// in a test file
test.use({ storageState: ".auth/admin.json" });
```

### One session per role and worker

For many test files with dependent tests, choose the role per file with a worker option, and share one page per worker:

```ts
// tests/fixtures.ts
import { test as base } from "@ahangl/playwright-ui5";
import type { Page } from "@playwright/test";

type Role = "admin" | "viewer";

export const test = base.extend<{}, { role: Role; rolePage: Page }>({
  role: ["viewer", { option: true, scope: "worker" }],
  rolePage: [
    async ({ browser, role }, use) => {
      const context = await browser.newContext({
        baseURL: process.env.WORKZONE_URL,
        storageState: `.auth/${role}.json` // written by the setup project
      });
      await use(await context.newPage());
      await context.close();
    },
    { scope: "worker" }
  ],
  page: async ({ rolePage }, use) => use(rolePage) // ui5 and fe use the shared page
});
export { expect } from "@ahangl/playwright-ui5";
```

```ts
// tests/auth.setup.ts: runs once, before all workers
import { test as setup } from "@playwright/test";
import { credentialsFromEnv, login } from "@ahangl/playwright-ui5";

for (const role of ["admin", "viewer"] as const) {
  setup(`log in as ${role}`, async ({ page }) => {
    await login(page, {
      url: process.env.WORKZONE_URL!,
      credentials: credentialsFromEnv(role.toUpperCase()), // ADMIN_USERNAME, VIEWER_USERNAME, ...
      storageStatePath: `.auth/${role}.json`
    });
  });
}
```

```ts
// tests/admin/import.spec.ts
import { test } from "../fixtures";

test.use({ role: "admin" });
test.describe.configure({ mode: "serial" });
```

- The setup project writes each `.auth/<role>.json` once. Parallel workers only read the files.
- Keep the default `fullyParallel: false`: tests in one file run in order in one worker (so they can share the page), and files run in parallel workers. `mode: "serial"` also skips the rest of a file after a failure.
- A browser context created in a fixture doesn't get the `use` options of the config, so pass `baseURL` and other context options to `browser.newContext()` yourself.
