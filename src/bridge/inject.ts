/* eslint-disable @typescript-eslint/no-explicit-any -- UI5 objects in the browser are untyped. */
import type { Frame, Page } from "@playwright/test";
import bridgeSource from "virtual:pwui5-bridge";
import { cleanStack } from "../util/step";

/** Wire format of values returned by the browser bridge (see src/browser/bridge.ts). */
export type Serialized =
  | { t: "u" }
  | { t: "v"; v: unknown }
  | { t: "d"; v: string }
  | { t: "a"; v: Serialized[] }
  | { t: "c"; d: ControlDescriptor }
  | { t: "o"; h: string; className: string; methods: string[] };

export interface ControlDescriptor {
  id: string;
  className: string;
  domRefId: string | null;
  methods: string[];
}

const NOT_INJECTED = "__pwui5_not_injected__";

/** Settings applied to the bridge in every frame of a page (see `__pwui5.configure`). */
export interface BridgeConfig {
  ignoreAutoWaitUrls: Array<string | RegExp>;
}

const bridgeConfigs = new WeakMap<Page, BridgeConfig>();

/** Sets the bridge settings for all frames of the page (applied whenever the bridge is injected). */
export function setBridgeConfig(page: Page, config: BridgeConfig): void {
  bridgeConfigs.set(page, config);
}

function wireConfig(config: BridgeConfig) {
  return {
    ignoreAutoWaitUrls: config.ignoreAutoWaitUrls.map((p) =>
      p instanceof RegExp ? { source: p.source, flags: p.flags } : { source: p, flags: "" }
    )
  };
}

/** Makes sure UI5 is loaded in the frame and the bridge is injected and ready. */
export async function ensureBridge(frame: Frame, timeout: number): Promise<void> {
  const state = await frame.evaluate(() => {
    const w = window as any;
    return {
      ui5: !!(w.sap && w.sap.ui && typeof w.sap.ui.require === "function"),
      bridge: !!w.__pwui5
    };
  });
  if (state.bridge) return;
  if (!state.ui5) {
    try {
      await frame.waitForFunction(
        () => {
          const w = window as any;
          return !!(w.sap && w.sap.ui && typeof w.sap.ui.require === "function");
        },
        undefined,
        { timeout }
      );
    } catch {
      throw cleanStack(new Error(`playwright-ui5: UI5 was not found in frame '${frame.url()}' within ${timeout}ms`));
    }
  }
  await frame.evaluate(bridgeSource);
  await frame.evaluate(() => (window as any).__pwui5.ready);
  const config = bridgeConfigs.get(frame.page());
  if (config && config.ignoreAutoWaitUrls.length) {
    await frame.evaluate((c) => (window as any).__pwui5.configure(c), wireConfig(config));
  }
}

/**
 * Calls `window.__pwui5.<method>(...args)` in the frame. Injects the bridge first if needed
 * (for example, after a reload).
 */
export async function callBridge<T>(frame: Frame, method: string, args: unknown[], timeout: number): Promise<T> {
  const invoke = () =>
    frame.evaluate(
      async ({ method, args, notInjected }) => {
        const bridge = (window as any).__pwui5;
        if (!bridge) return notInjected;
        const parts = method.split(".");
        let owner: any = bridge;
        for (const p of parts.slice(0, -1)) owner = owner[p];
        return owner[parts[parts.length - 1]](...args);
      },
      { method, args, notInjected: NOT_INJECTED }
    );
  try {
    let result = await invoke();
    if (result === NOT_INJECTED) {
      await ensureBridge(frame, timeout);
      result = await invoke();
    }
    return result as T;
  } catch (e) {
    throw toNodeError(e);
  }
}

/**
 * Errors raised in the browser come back with the browser's stack. Re-create them in Node so the
 * (async) stack leads to the user's test line, and drop Playwright's `frame.evaluate:` prefix.
 */
function toNodeError(e: unknown): unknown {
  if (!(e instanceof Error)) return e;
  const m = /^(?:frame|page)\.evaluate: (?:Error: )?([\s\S]*)$/.exec(e.message);
  if (!m) return cleanStack(e);
  const message = m[1].split(/\n\s+at /)[0].trim();
  return cleanStack(new Error(message));
}
