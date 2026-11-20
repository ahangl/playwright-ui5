export interface UI5Options {
  /**
   * Maximum time in ms to wait for UI5 to become idle (pending requests, timeouts, rendering)
   * and for controls matched by a selector to appear. Default: `15000`.
   */
  waitForUI5Timeout?: number;
  /**
   * Which frame hosts the UI5 application:
   * - `"auto"` (default): the SAP Build Work Zone / launchpad application iframe if there is one,
   *   otherwise any visible child frame running UI5, otherwise the main frame.
   * - `"main"`: always the top-level frame (standalone apps, launchpad without iframes).
   * - any other string: CSS selector of the `<iframe>` that hosts the app.
   */
  appFrame?: "auto" | "main" | (string & {});
  /**
   * Timeout in ms for a single Fiori elements test library (OPA) statement. Default: `30000`.
   */
  feTimeout?: number;
  /**
   * CSS selector used by `appFrame: "auto"` to detect the launchpad application iframe.
   */
  launchpadIframeSelector?: string;
  /**
   * Requests (XHR and fetch) whose URL matches one of these patterns are not waited for, e.g.
   * long polling or push channels that never finish. Strings are regular expression sources (like
   * wdi5's `ignoreAutoWaitUrls`). Default: `[]`.
   *
   * Requests opened before the library first talks to a frame are still waited for until they
   * finish. Ignoring `fetch` requests needs the `ui5` fixture (it saves the browser's own `fetch`).
   */
  ignoreAutoWaitUrls?: Array<string | RegExp>;
}

export type ResolvedUI5Options = Required<UI5Options>;

export const DEFAULT_LAUNCHPAD_IFRAME_SELECTOR = [
  'iframe[data-sap-ushell-active="true"]',
  "iframe.sapUShellApplicationContainer",
  'iframe[id^="application-"]'
].join(", ");

export function resolveOptions(options: UI5Options = {}): ResolvedUI5Options {
  return {
    waitForUI5Timeout: options.waitForUI5Timeout ?? 15_000,
    appFrame: options.appFrame ?? "auto",
    feTimeout: options.feTimeout ?? 30_000,
    launchpadIframeSelector: options.launchpadIframeSelector ?? DEFAULT_LAUNCHPAD_IFRAME_SELECTOR,
    ignoreAutoWaitUrls: options.ignoreAutoWaitUrls ?? []
  };
}
