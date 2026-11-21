---
layout: home
title: Introduction
description: "UI5-aware end-to-end testing for Playwright: find UI5 controls, call their methods, wait for UI5, and run the Fiori elements test library."

hero:
  name: playwright-ui5
  text: UI5-aware end-to-end testing for Playwright
  tagline: Find UI5 controls, call their methods, wait for UI5 automatically, and run the Fiori elements test library, inspired by wdi5.
  actions:
    - theme: brand
      text: Get started
      link: /installation
    - theme: alt
      text: Coming from wdi5?
      link: /migration-wdi5
    - theme: alt
      text: Coming from OPA?
      link: /migration-opa

features:
  - title: Control API
    details: Find controls with wdi5/OPA selectors, call any control method (also as a chain with a single await), press, enter text, or get a Playwright Locator. Every call first waits until UI5 is idle.
    link: /usage
  - title: Retrying assertions
    details: expect(ui5.control(sel)).toHaveUI5Text("Go") retries until the control matches, like Playwright's locator assertions.
    link: /usage#assertions
  - title: Fiori elements V4 test library
    details: Run SAP's official sap.fe.test page objects (ListReport, ObjectPage, Shell) with typed Given/When/Then chains.
    link: /api/fe#functions
  - title: SAP Build Work Zone
    details: The app iframe is detected automatically. Log in once with SAP IAS and reuse the session with Playwright's storageState.
    link: /authentication
---

## What is playwright-ui5?

`@ahangl/playwright-ui5` extends Playwright's `test` with two fixtures:

- **`ui5`**: the control API. It finds UI5 controls by selector, calls their methods in the browser, and waits until UI5 is idle (no pending requests, timeouts or rendering) before every call.
- **`fe`**: the SAP Fiori elements V4 test library (`sap.fe.test`) with typed `Given` / `When` / `Then` chains.

It also exports `expect` with UI5 matchers, and `login` / `ias` for SAP Build Work Zone authentication.

```ts
import { test, expect } from "@ahangl/playwright-ui5";

test("filter books", async ({ ui5 }) => {
  await ui5.goTo("/index.html");
  await ui5.enterText({ controlType: "sap.m.Input", labelFor: { text: "Author" } }, "Edgar Allan Poe");
  await ui5.press({ controlType: "sap.m.Button", properties: { text: "Go" } });
  await expect(ui5.controls({ controlType: "sap.m.ColumnListItem" })).toHaveUI5Count(2);
});
```

## Which parts work in my app?

Calls that start with `ui5.` or `expect(` work in **any UI5 app**. `fe.init` and `Given` / `When` / `Then` statements need a **Fiori elements V4** app.

| Feature                                                                       | Freestyle UI5 app |   Fiori elements V2   | Fiori elements V4 |
| ----------------------------------------------------------------------------- | :---------------: | :-------------------: | :---------------: |
| [Control API](./usage): `ui5.control`, chaining, `press`, `enterText`, `exec` |         ✓         |           ✓           |         ✓         |
| [UI5 assertions](./usage#assertions): `toHaveUI5Text`, `toHaveUI5Count`, ...  |         ✓         |           ✓           |         ✓         |
| [Navigation](./usage#navigation) by URL or hash: `ui5.goTo("#...")`           |         ✓         |           ✓           |         ✓         |
| Navigation with the app's router: `ui5.goTo({ route })`                       | ✓ (with routing)  |  use a hash instead   |         ✓         |
| Launchpad and Work Zone: app frame detection, `ui5.shell`                     |         ✓         |           ✓           |         ✓         |
| [Login](./authentication): `login`, `ias()`                                   |         ✓         |           ✓           |         ✓         |
| [Fiori elements test library](./fe-testlib): `fe`, `Given` / `When` / `Then`  |         –         | – (not supported yet) |         ✓         |

In a Fiori elements V4 app with custom parts (custom sections, columns, actions or building blocks), use `fe` for the standard parts and the control API for the custom ones, in the same test.

## Testing scope

playwright-ui5 is for end-to-end tests: real user flows through the UI, against a mock server or a real system. Test business logic with unit tests (QUnit, or OPA integration tests in the app), not through the UI.

## For AI agents

This documentation is also available as plain text: [`llms.txt`](./llms.txt){target="_self"} (index) and [`llms-full.txt`](./llms-full.txt){target="_self"} (all pages in one file). Every page is also available as Markdown by adding `.md` to its URL. The [API reference](./api/) lists `ui5`, `fe` and `expect` with their signatures.
