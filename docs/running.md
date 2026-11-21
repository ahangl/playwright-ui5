---
description: "Run and debug playwright-ui5 tests, read report steps and error messages, and inspect controls."
---

# Running and debugging

Tests run with Playwright's test runner, so all of Playwright's tooling works:

```bash
npx playwright test            # all tests
npx playwright test --ui       # UI mode: watch, time travel, pick locators
npx playwright show-report     # HTML report of the last run
```

See Playwright's docs on [running tests](https://playwright.dev/docs/running-tests), [debugging](https://playwright.dev/docs/debug), the [trace viewer](https://playwright.dev/docs/trace-viewer) and [parallelism](https://playwright.dev/docs/test-parallel).

## Steps in the report and trace

Every awaited UI5 call appears as one step in the Playwright report and trace. The step is titled like the call and located at your test line:

```txt
ui5.control({"controlType":"sap.m.Table"}).getItems(0).getBindingContextPath()
ui5: press ui5.control({"controlType":"sap.m.Button","properties":{"text":"Go"}})
```

- Actions are titled `ui5: press …` and `ui5: enter "<text>" into …`.
- Fiori elements statements are titled with `Given` / `When` / `Then` and the statement.
- A failing call is marked as a failed step.
- The retrying `expect` matchers show only the matcher step, not each attempt.
- Calls on `ui5.shell` are labeled `ui5.shell.…`.

To keep a trace with DOM snapshots, network, and console for failing tests, use `trace: "retain-on-failure"`.

## Error messages

Errors point at your test line, not at library internals. The most common one is a selector that matches nothing:

```txt
playwright-ui5: no control found for selector {"controlType":"sap.m.Button","properties":{"text":"Go"}} within 15000ms
```

A failing chain shows the whole chain, the failing step, and what the steps before it returned:

```txt
playwright-ui5: ui5.control({"controlType":"sap.m.Table"}).getItems(0).getNope() failed at .getNope():
  'getNope' is not a function on sap.m.ColumnListItem
  ✔ ui5.control({"controlType":"sap.m.Table"}) → sap.m.Table#…
  ✔ getItems(0) → sap.m.ColumnListItem#…
  ✘ getNope()
```

A failing Fiori elements statement contains the statement, OPA's diagnostics, and the last OPA log entries.

If no frame with the app is found, the error lists what playwright-ui5 saw (app iframes, whether the main frame runs UI5 or a launchpad or Work Zone shell) and suggests setting `ui5Options.appFrame`.

## Inspect controls

```ts
const control = await ui5.control(selector);
console.log(control.id, control.className); // for example, "__button3", "sap.m.Button"
console.log(control.methods); // all public methods
console.log(await ui5.version()); // UI5 version of the app
```

For a look at the live control tree, open the app with `--headed` or `--debug` and use the UI5 Inspector browser extension.
