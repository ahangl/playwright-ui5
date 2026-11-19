import type { Frame, Locator, Page } from "@playwright/test";
import { resolveOptions, type ResolvedUI5Options, type UI5Options } from "./config";
import { callBridge, ensureBridge, type ControlDescriptor, type Serialized } from "./bridge/inject";
import { isFrameStillValid, resolveAppFrame } from "./frame/resolveAppFrame";
import {
  createRemoteControl,
  execExpression,
  fromBrowser,
  toBrowser,
  type Remote,
  type RemoteContext,
  type RemoteControl,
} from "./control/remote";
import type { UI5Selector } from "./control/selector";
import { cleanStack, step } from "./util/step";

function describeSelector(selector: UI5Selector): string {
  try {
    return JSON.stringify(toBrowser(selector), (_k, v) =>
      v && typeof v === "object" && "__pwui5re" in v ? `/${v.__pwui5re.source}/${v.__pwui5re.flags}` : v
    );
  } catch {
    return String(selector);
  }
}

/**
 * Entry point for UI5-aware testing of a page (the `ui5` fixture).
 *
 * All operations first wait until UI5 is idle (no pending requests, timeouts or rendering) in the
 * frame that hosts the app - in SAP Build Work Zone this is the application iframe.
 */
export class UI5 {
  readonly options: ResolvedUI5Options;
  private cachedFrame: Frame | undefined;

  constructor(
    readonly page: Page,
    options: UI5Options = {},
    private readonly baseURL?: string
  ) {
    this.options = resolveOptions(options);
  }

  // ----------------------------------------------------------------------------------------------
  // frames

  /** The frame that runs the UI5 application (resolved according to the `appFrame` option). */
  async appFrame(): Promise<Frame> {
    if (this.cachedFrame && (await isFrameStillValid(this.page, this.cachedFrame, this.options))) {
      return this.cachedFrame;
    }
    const frame = await resolveAppFrame(this.page, this.options);
    await ensureBridge(frame, this.options.waitForUI5Timeout);
    this.cachedFrame = frame;
    return frame;
  }

  /** The top-level frame (the launchpad / Work Zone shell, if any). */
  shellFrame(): Frame {
    return this.page.mainFrame();
  }

  /** Forget the resolved app frame, e.g. after navigating to another app. */
  resetFrame(): void {
    this.cachedFrame = undefined;
  }

  private async ctx(timeout?: number): Promise<RemoteContext> {
    return { frame: await this.appFrame(), timeout: timeout ?? this.options.waitForUI5Timeout };
  }

  // ----------------------------------------------------------------------------------------------
  // general

  /** Waits until UI5 has no pending work (requests, timeouts, rendering, busy indicators). */
  async waitForUI5(options: { timeout?: number } = {}): Promise<void> {
    const { frame, timeout } = await this.ctx(options.timeout);
    await callBridge(frame, "waitForUI5", [timeout], timeout);
  }

  /** UI5 version of the application frame. */
  async version(): Promise<string> {
    const { frame, timeout } = await this.ctx();
    return callBridge<string>(frame, "version", [], timeout);
  }

  /**
   * Navigates and waits for UI5.
   * - `"#SalesOrder-manage"` / `"#/Books(1)"`: changes the hash of the current page (or of
   *   `baseURL` if nothing is loaded yet) - for Work Zone/launchpads this is intent navigation.
   * - anything else is passed to `page.goto` (relative URLs use `baseURL`).
   */
  async goTo(target: string, options: { timeout?: number } = {}): Promise<void> {
    await step(`ui5: go to ${target}`, async () => {
      let url = target;
      if (target.startsWith("#")) {
        const current = this.page.url();
        const base = current && current !== "about:blank" ? current : this.baseURL;
        if (!base) throw cleanStack(new Error("playwright-ui5: goTo('#...') needs a loaded page or a baseURL"));
        url = base.split("#")[0] + target;
      }
      await this.page.goto(url);
      this.resetFrame();
      await this.waitForUI5(options);
    });
  }

  /**
   * Runs a function inside the app frame after UI5 is idle. The function is serialized, so pass
   * test-scope values as arguments. UI5 controls returned are converted to remote controls.
   */
  async exec<R, A extends unknown[]>(fn: (...args: A) => R, ...args: A): Promise<Remote<Awaited<R>>> {
    const ctx = await this.ctx();
    await callBridge(ctx.frame, "waitForUI5", [ctx.timeout], ctx.timeout);
    const result = await ctx.frame.evaluate(execExpression(fn as (...a: any[]) => unknown, args));
    return fromBrowser(result as Serialized, ctx) as Remote<Awaited<R>>;
  }

  // ----------------------------------------------------------------------------------------------
  // controls

  /**
   * Finds a UI5 control (waiting up to `waitForUI5Timeout` for it to appear) - the equivalent of
   * wdi5's `browser.asControl()`. A `timeout` given here also applies to later operations on the
   * returned control (method calls, press, enterText).
   *
   * @example
   * const btn = await ui5.control<Button>({ controlType: "sap.m.Button", properties: { text: "Go" } });
   * await btn.press();
   * expect(await btn.getEnabled()).toBe(true);
   */
  async control<T = unknown>(selector: UI5Selector, options: { timeout?: number } = {}): Promise<RemoteControl<T>> {
    const ctx = await this.ctx(options.timeout);
    const d = await callBridge<ControlDescriptor | null>(
      ctx.frame,
      "findControl",
      [toBrowser(selector), ctx.timeout],
      ctx.timeout
    );
    if (!d) {
      throw cleanStack(new Error(`playwright-ui5: no control found for selector ${describeSelector(selector)} within ${ctx.timeout}ms`));
    }
    return createRemoteControl<T>(ctx, d);
  }

  /** Like {@link control} but returns `null` instead of throwing when nothing matches. */
  async controlOrNull<T = unknown>(selector: UI5Selector, options: { timeout?: number } = {}): Promise<RemoteControl<T> | null> {
    const ctx = await this.ctx(options.timeout);
    const d = await callBridge<ControlDescriptor | null>(
      ctx.frame,
      "findControl",
      [toBrowser(selector), ctx.timeout],
      ctx.timeout
    );
    return d ? createRemoteControl<T>(ctx, d) : null;
  }

  /** All controls currently matching the selector (after UI5 is idle; does not wait for matches). */
  async controls<T = unknown>(selector: UI5Selector, options: { timeout?: number } = {}): Promise<RemoteControl<T>[]> {
    const ctx = await this.ctx(options.timeout);
    const ds = await callBridge<ControlDescriptor[]>(ctx.frame, "findControls", [toBrowser(selector), ctx.timeout], ctx.timeout);
    return ds.map((d) => createRemoteControl<T>(ctx, d));
  }

  /** Playwright locator of the root DOM element of the control matching the selector. */
  async locator(selector: UI5Selector, options: { timeout?: number } = {}): Promise<Locator> {
    return (await this.control(selector, options)).locator();
  }

  /** Shortcut for `(await ui5.control(selector)).press()`. */
  async press(selector: UI5Selector, options: { timeout?: number; native?: boolean } = {}): Promise<void> {
    await (await this.control(selector, options)).press(options);
  }

  /** Shortcut for `(await ui5.control(selector)).enterText(text)`. */
  async enterText(
    selector: UI5Selector,
    text: string,
    options: { timeout?: number; clearTextFirst?: boolean } = {}
  ): Promise<void> {
    await (await this.control(selector, options)).enterText(text, options);
  }
}
