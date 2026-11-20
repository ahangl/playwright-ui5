# Configuration

## `ui5Options`

Set options per project or per file through Playwright's `use`:

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";
import type { UI5TestOptions } from "@ahangl/playwright-ui5";

export default defineConfig<UI5TestOptions>({
  use: {
    baseURL: "http://localhost:8080",
    ui5Options: {
      waitForUI5Timeout: 15_000,
      feTimeout: 30_000,
      appFrame: "auto",
      ignoreAutoWaitUrls: [/\/longpoll/, "notifications\\?"]
    }
  }
});
```

```ts
// for one file
test.use({ ui5Options: { appFrame: "#application-frame" } });
```

| Option                    | Default                             | Description                                                                         |
| ------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| `waitForUI5Timeout`       | `15000`                             | Max. ms to wait for UI5 to become idle and for controls to appear.                  |
| `feTimeout`               | `30000`                             | Max. ms for a single Fiori elements test library (OPA) statement (only `fe`).       |
| `appFrame`                | `"auto"`                            | Which frame runs the app: `"auto"`, `"main"` or a CSS selector of the app `iframe`. |
| `launchpadIframeSelector` | `DEFAULT_LAUNCHPAD_IFRAME_SELECTOR` | CSS selector that `appFrame: "auto"` uses to find the launchpad app iframe.         |
| `ignoreAutoWaitUrls`      | `[]`                                | Requests (XHR and `fetch`) that waiting for UI5 ignores.                            |

### waitForUI5Timeout

Every call (control lookup, method call, action, `goTo`) first waits until UI5 is idle: no pending requests, timeouts, rendering or busy indicators. This option limits that wait and the wait for a control to appear. Most calls also take `{ timeout }` to override it once:

```ts
await ui5.control(selector, { timeout: 30_000 }).press();
```

A `timeout` given to `ui5.control()` also applies to later calls on the returned control.

### feTimeout

The timeout of each Fiori elements statement (`await When.onTheMainPage...`). `fe.init(pages, { timeout })` overrides it for one journey.

### appFrame

- `"auto"` (default) uses the first of these that applies:
  1. A visible launchpad application iframe (Work Zone / FLP). It is used even while UI5 is still loading inside it; the helper then waits for UI5 there.
  2. Any other visible iframe that already runs UI5.
  3. The main frame, for a standalone app.

  If the main frame is a launchpad, the helper asks it where the current app runs (`sap.ushell` AppLifeCycle). The launchpad home page or an app embedded in the launchpad window uses the main frame. Otherwise the helper keeps waiting for the app iframe.

- `"main"`: always the top-level frame.
- Any other string: a CSS selector of the `<iframe>` that hosts the app, e.g. `"#application-frame"`.

The detected frame is re-checked before each call, so opening an app from the home page (e.g. via the `Shell` page object or `ui5.goTo("#Intent-action")`) switches to the new app's iframe.

### launchpadIframeSelector

Only needed for custom hosts. The default (`DEFAULT_LAUNCHPAD_IFRAME_SELECTOR`, exported) is:

```css
iframe[data-sap-ushell-active="true"], iframe.sapUShellApplicationContainer, iframe[id^="application-"]
```

### ignoreAutoWaitUrls

Requests that waiting for UI5 ignores, like wdi5's option of the same name. Use it for requests that never finish, such as long polling or push channels. Without it, every call waits for them until `waitForUI5Timeout` runs out.

- Patterns are RegExps or strings. A string is a regex source, so escape `?` and `.` where needed.
- XHR and `fetch` requests are both covered.
- Requests opened before the library first talks to a frame are still waited for until they finish. In practice that's only a request opened during page load that never finishes.
- Ignoring `fetch` needs the `ui5` fixture: it saves the browser's own `fetch` before UI5 loads. If you create `new UI5(page, options)` yourself, only XHR requests are ignored.

## Playwright options

Everything else is plain Playwright configuration. Useful settings for UI5 apps:

```ts
export default defineConfig<UI5TestOptions>({
  timeout: 120_000, // UI5 apps and launchpads load slowly
  expect: { timeout: 15_000 }, // used by the retrying UI5 matchers
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  }
});
```

## `package.json` scripts

```json
{
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "report": "playwright show-report"
  }
}
```
