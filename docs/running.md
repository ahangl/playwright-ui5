# Running and debugging

playwright-ui5 runs inside Playwright, so all of Playwright's tooling works.

## Running

```bash
npx playwright test                        # all tests, headless
npx playwright test tests/books.spec.ts    # one file
npx playwright test -g "search books"      # tests whose title matches
npx playwright test --project=workzone     # one project
npx playwright test --headed               # with a visible browser
npx playwright test --ui                   # UI mode: watch, time travel, pick locators
```

Tests in one file run in order. Files run in parallel workers; set `fullyParallel: true` to also parallelize tests within a file, or `test.describe.configure({ mode: "serial" })` for tests that depend on each other.

## Debugging

```bash
npx playwright test --debug                # Playwright Inspector, step through the test
npx playwright show-report                 # HTML report of the last run
npx playwright show-trace test-results/<test>/trace.zip
```

### Steps in the report and trace

Every awaited UI5 call appears as one step in the Playwright report and trace. The step is titled like the call and located at your test line:

```
ui5.control({"controlType":"sap.m.Table"}).getItems(0).getBindingContextPath()
ui5: press ui5.control({"controlType":"sap.m.Button","properties":{"text":"Go"}})
```

- Actions are titled `ui5: press …` and `ui5: enter "<text>" into …`.
- Fiori elements statements are titled with `Given` / `When` / `Then` and the statement.
- A failing call is marked as a failed step.
- The retrying `expect` matchers show only the matcher step, not each attempt.
- Calls on `ui5.shell` are labeled `ui5.shell.…`.

Use `trace: "retain-on-failure"` to keep a trace with DOM snapshots, network and console for failing tests.

### Error messages

Errors point at your test line, not at library internals.

A failing chain shows the whole chain, the failing step and what the steps before it returned:

```
playwright-ui5: ui5.control({"controlType":"sap.m.Table"}).getItems(0).getNope() failed at .getNope():
  'getNope' is not a function on sap.m.ColumnListItem
  ✔ ui5.control({"controlType":"sap.m.Table"}) → sap.m.Table#…
  ✔ getItems(0) → sap.m.ColumnListItem#…
  ✘ getNope()
```

A failing Fiori elements statement contains the statement, OPA's diagnostics and the last checks that passed.

If no frame with the app is found, the error lists what the helper saw (launchpad iframes, whether the main frame runs UI5 or a launchpad) and suggests setting `ui5Options.appFrame`.

### Inspecting controls

```ts
const control = await ui5.control(selector);
console.log(control.id, control.className); // e.g. "__button3", "sap.m.Button"
console.log(control.methods); // all public methods
console.log(await ui5.version()); // UI5 version of the app
```

For a look at the live control tree, open the app with `--headed` or `--debug` and use the UI5 Inspector browser extension.
