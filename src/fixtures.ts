import {
  test as base,
  type PlaywrightTestArgs,
  type PlaywrightTestOptions,
  type PlaywrightWorkerArgs,
  type PlaywrightWorkerOptions,
  type TestType,
} from "@playwright/test";
import type { UI5Options } from "./config";
import { FioriElements } from "./fe/FioriElements";
import { UI5 } from "./ui5";

export interface UI5Fixtures {
  /** UI5-aware access to the application (controls, waitForUI5, navigation). */
  ui5: UI5;
  /** SAP Fiori elements V4 test library (`sap.fe.test`) facade. */
  fe: FioriElements;
}

export interface UI5TestOptions {
  /** Options for the `ui5`/`fe` fixtures, e.g. `use: { ui5Options: { appFrame: "auto" } }`. */
  ui5Options: UI5Options;
}

/** Playwright `test` extended with the `ui5` and `fe` fixtures. */
export const test: TestType<
  PlaywrightTestArgs & PlaywrightTestOptions & UI5TestOptions & UI5Fixtures,
  PlaywrightWorkerArgs & PlaywrightWorkerOptions
> = base.extend<UI5TestOptions & UI5Fixtures>({
  ui5Options: [{}, { option: true }],
  ui5: async ({ page, ui5Options, baseURL }, use) => {
    if (ui5Options.ignoreAutoWaitUrls?.length) {
      // Keep the browser's own fetch (before UI5's fetch waiter wraps it), so that ignored
      // requests can bypass the waiter. Runs in every frame before any page script.
      await page.addInitScript(() => {
        const w = window as any;
        if (!w.__pwui5NativeFetch && typeof w.fetch === "function") w.__pwui5NativeFetch = w.fetch;
      });
    }
    await use(new UI5(page, ui5Options, baseURL));
  },
  fe: async ({ ui5 }, use) => {
    await use(new FioriElements(ui5));
  },
});

export { expect } from "./expect";
