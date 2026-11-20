import type { Frame, Locator, Page } from "@playwright/test";
import { resolveOptions, type ResolvedUI5Options, type UI5Options } from "./config";
import { callBridge, ensureBridge, setBridgeConfig, type ControlDescriptor, type Serialized } from "./bridge/inject";
import { isFrameStillValid, resolveAppFrame } from "./frame/resolveAppFrame";
import {
  createRemoteControl,
  execExpression,
  fromBrowser,
  toBrowser,
  type ControlChain,
  type ControlsQuery,
  type Remote,
  type RemoteContext,
  type RemoteControl
} from "./control/remote";
import { createChain, createControlsQuery, describeSelector } from "./control/chain";
import type { UI5Selector } from "./control/selector";
import { cleanStack, formatArgs, step, withoutSteps } from "./util/step";

/** Router navigation target for {@link UI5.goTo}, like wdi5's `goTo({ oRoute })`. */
export interface UI5Route {
  /** Route name from the manifest (`sap.ui5/routing/routes`). */
  route: string;
  /** Route parameters, e.g. `{ key: "251" }` for the pattern `Books({key})`. */
  params?: Record<string, unknown>;
  /** Id of the component whose router is used. Default: the only application component with a router. */
  componentId?: string;
  /** Replace the current history entry instead of adding one. */
  replace?: boolean;
  /**
   * Routing information for nested components, passed to `navTo` as `oComponentTargetInfo`
   * (wdi5: `oRoute.oComponentTargetInfo`).
   */
  componentTargetInfo?: Record<string, unknown>;
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

  /**
   * @param label Prefix of step titles and error messages (internal: `"ui5.shell"` for {@link shell}).
   */
  constructor(
    readonly page: Page,
    options: UI5Options = {},
    private readonly baseURL?: string,
    private readonly label = "ui5"
  ) {
    this.options = resolveOptions(options);
    if (this.options.ignoreAutoWaitUrls.length) {
      setBridgeConfig(page, { ignoreAutoWaitUrls: this.options.ignoreAutoWaitUrls });
    }
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

  private shellUI5: UI5 | undefined;

  /**
   * The control API for the top-level frame - in SAP Build Work Zone / a launchpad that is the
   * shell (header, user menu, ...), while `ui5` itself works in the application frame. The
   * counterpart of wdi5's `toWorkZoneShell()`, without switching back and forth.
   *
   * @example
   * await ui5.shell.control({ id: "userActionsMenuHeaderButton" }).press();
   */
  get shell(): UI5 {
    return (this.shellUI5 ??= new UI5(
      this.page,
      { ...this.options, appFrame: "main" },
      this.baseURL,
      `${this.label}.shell`
    ));
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
  waitForUI5(options: { timeout?: number } = {}): Promise<void> {
    return step(`${this.label}.waitForUI5()`, async () => {
      const { frame, timeout } = await this.ctx(options.timeout);
      await callBridge(frame, "waitForUI5", [timeout], timeout);
    });
  }

  /** UI5 version of the application frame. */
  version(): Promise<string> {
    return step(`${this.label}.version()`, async () => {
      const { frame, timeout } = await this.ctx();
      return callBridge<string>(frame, "version", [], timeout);
    });
  }

  /**
   * Navigates and waits for UI5.
   * - `"#SalesOrder-manage"` / `"#/Books(1)"`: changes the hash of the current page (or of
   *   `baseURL` if nothing is loaded yet) - for Work Zone/launchpads this is intent navigation.
   * - `{ route, params }`: navigates with the app's router (`getRouter().navTo`), without reloading.
   * - anything else is passed to `page.goto` (relative URLs use `baseURL`).
   */
  async goTo(target: string | UI5Route, options: { timeout?: number } = {}): Promise<void> {
    if (typeof target !== "string") {
      const { route, params, componentId, replace, componentTargetInfo } = target;
      await step(`${this.label}: go to route ${route}${params ? " " + JSON.stringify(params) : ""}`, async () => {
        const { frame, timeout } = await this.ctx(options.timeout);
        await callBridge(
          frame,
          "navTo",
          [route, params, componentId, !!replace, componentTargetInfo, timeout],
          timeout
        );
        await withoutSteps(() => this.waitForUI5(options));
      });
      return;
    }
    await step(`${this.label}: go to ${target}`, async () => {
      let url = target;
      if (target.startsWith("#")) {
        const current = this.page.url();
        const base = current && current !== "about:blank" ? current : this.baseURL;
        if (!base) throw cleanStack(new Error("playwright-ui5: goTo('#...') needs a loaded page or a baseURL"));
        url = base.split("#")[0] + target;
      }
      await this.page.goto(url);
      this.resetFrame();
      await withoutSteps(() => this.waitForUI5(options));
    });
  }

  /**
   * Runs a function inside the app frame after UI5 is idle. The function is serialized, so pass
   * test-scope values as arguments. UI5 controls returned are converted to remote controls.
   */
  exec<R, A extends unknown[]>(fn: (...args: A) => R, ...args: A): Promise<Remote<Awaited<R>>> {
    return step(`${this.label}.exec(${formatArgs([fn, ...args])})`, async () => {
      const ctx = await this.ctx();
      await callBridge(ctx.frame, "waitForUI5", [ctx.timeout], ctx.timeout);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- execExpression takes any function
      const result = await ctx.frame.evaluate(execExpression(fn as (...a: any[]) => unknown, args));
      return fromBrowser(result as Serialized, ctx) as Remote<Awaited<R>>;
    });
  }

  // ----------------------------------------------------------------------------------------------
  // controls

  /**
   * Finds a UI5 control (waiting up to `waitForUI5Timeout` for it to appear) - the equivalent of
   * wdi5's `browser.asControl()`. A `timeout` given here also applies to later operations on the
   * returned control (method calls, press, enterText).
   *
   * The result is a lazy chain: await it to get the control, or call methods on it directly - the
   * whole chain runs in one browser round trip when awaited.
   *
   * @example
   * const btn = await ui5.control<Button>({ controlType: "sap.m.Button", properties: { text: "Go" } });
   * await btn.press();
   * expect(await btn.getEnabled()).toBe(true);
   * expect(await ui5.control<Table>({ controlType: "sap.m.Table" }).getItems(0).getBindingContextPath()).toBe("/Books(1)");
   */
  control<T = unknown>(selector: UI5Selector, options: { timeout?: number } = {}): ControlChain<T> {
    return createChain(
      {
        resolve: async (timeout) => ({ ctx: await this.ctx(timeout ?? options.timeout), start: { selector } }),
        label: `${this.label}.control(${describeSelector(selector)})`
      },
      [],
      new Error()
    );
  }

  /** Like {@link control} but returns `null` instead of throwing when nothing matches. */
  controlOrNull<T = unknown>(
    selector: UI5Selector,
    options: { timeout?: number } = {}
  ): Promise<RemoteControl<T> | null> {
    return step(`${this.label}.controlOrNull(${describeSelector(selector)})`, async () => {
      const ctx = await this.ctx(options.timeout);
      const d = await callBridge<ControlDescriptor | null>(
        ctx.frame,
        "findControl",
        [toBrowser(selector), ctx.timeout],
        ctx.timeout
      );
      return d ? createRemoteControl<T>(ctx, d) : null;
    });
  }

  /**
   * All controls currently matching the selector (after UI5 is idle; does not wait for matches).
   * Use `await expect(ui5.controls(selector)).toHaveUI5Count(n)` to wait for a number of matches.
   */
  controls<T = unknown>(selector: UI5Selector, options: { timeout?: number } = {}): ControlsQuery<T> {
    return createControlsQuery((timeout) => this.ctx(timeout ?? options.timeout), selector, new Error(), this.label);
  }

  /** Playwright locator of the root DOM element of the control matching the selector. */
  async locator(selector: UI5Selector, options: { timeout?: number } = {}): Promise<Locator> {
    return (await this.control(selector, options)).locator();
  }

  /** Shortcut for `ui5.control(selector).press()` (one step for the lookup and the press). */
  async press(selector: UI5Selector, options: { timeout?: number; native?: boolean } = {}): Promise<void> {
    await this.control(selector, options).press(options);
  }

  /** Shortcut for `ui5.control(selector).enterText(text)` (one step for the lookup and the input). */
  async enterText(
    selector: UI5Selector,
    text: string,
    options: { timeout?: number; clearTextFirst?: boolean } = {}
  ): Promise<void> {
    await this.control(selector, options).enterText(text, options);
  }
}
