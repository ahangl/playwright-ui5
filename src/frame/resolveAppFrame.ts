import type { Frame, Page } from "@playwright/test";
import type { ResolvedUI5Options } from "../config";
import { callBridge, ensureBridge } from "../bridge/inject";
import { cleanStack } from "../util/step";

async function probe(frame: Frame): Promise<{ ui5: boolean; ushell: boolean }> {
  if (frame.isDetached()) return { ui5: false, ushell: false };
  try {
    return await frame.evaluate(() => {
      const w = window as any;
      const ui5 = !!(w.sap && w.sap.ui && typeof w.sap.ui.require === "function");
      return { ui5, ushell: ui5 && !!(w.sap.ushell && w.sap.ushell.Container) };
    });
  } catch {
    // frame navigated or cross-process frame not ready yet
    return { ui5: false, ushell: false };
  }
}

async function isVisibleFrame(frame: Frame): Promise<boolean> {
  try {
    const el = await frame.frameElement();
    return await el.isVisible();
  } catch {
    return false;
  }
}

/**
 * The visible launchpad application iframe, if any - also while UI5 is still loading inside it
 * (the caller waits for UI5 in it). Falling back to the shell frame at that moment would run
 * everything in the wrong window.
 */
async function launchpadAppFrame(page: Page, selector: string): Promise<Frame | undefined> {
  const iframes = page.locator(selector);
  const count = await iframes.count();
  for (let i = 0; i < count; i++) {
    const handle = await iframes.nth(i).elementHandle().catch(() => null);
    if (!handle || !(await handle.isVisible().catch(() => false))) continue;
    const frame = await handle.contentFrame();
    if (frame && !frame.isDetached()) return frame;
  }
  return undefined;
}

/** Generic fallback for custom hosts: a visible child frame that already runs UI5. */
async function anyChildUI5Frame(page: Page): Promise<Frame | undefined> {
  const main = page.mainFrame();
  for (const frame of page.frames()) {
    if (frame === main || frame.isDetached()) continue;
    if ((await probe(frame)).ui5 && (await isVisibleFrame(frame))) return frame;
  }
  return undefined;
}

interface ShellState {
  /** Whether the launchpad could tell us anything (AppLifeCycle service available). */
  known: boolean;
  hash: string;
  /** The current app runs in the launchpad window itself. */
  embedded?: boolean;
  /** The launchpad home page is shown (or no app yet). */
  home?: boolean;
  type?: string;
}

/** Asks the launchpad (sap.ushell AppLifeCycle) in the main frame where the current app runs. */
async function shellState(main: Frame): Promise<ShellState> {
  try {
    return await main.evaluate(async () => {
      const w = window as any;
      const hash = location.hash;
      const container = w.sap && w.sap.ushell && w.sap.ushell.Container;
      if (!container || typeof container.getServiceAsync !== "function") return { known: false, hash };
      try {
        const service: any = await Promise.race([
          container.getServiceAsync("AppLifeCycle"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
        ]);
        const app = service && typeof service.getCurrentApplication === "function" ? service.getCurrentApplication() : undefined;
        return {
          known: true,
          hash,
          embedded: !!(app && app.componentInstance && !app.homePage),
          home: !app || !!app.homePage,
          type: app ? String(app.applicationType) : undefined,
        };
      } catch {
        return { known: false, hash };
      }
    });
  } catch {
    return { known: false, hash: "" };
  }
}

const isHomeHash = (hash: string) => hash === "" || hash === "#" || /^#Shell-home(?:$|[?&/])/.test(hash);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Finds the frame that runs the UI5 application under test. */
export async function resolveAppFrame(page: Page, options: ResolvedUI5Options): Promise<Frame> {
  const timeout = options.waitForUI5Timeout;

  if (options.appFrame === "main") return page.mainFrame();

  if (options.appFrame !== "auto") {
    const handle = await page.locator(options.appFrame).first().elementHandle({ timeout });
    const frame = await handle?.contentFrame();
    if (!frame) throw cleanStack(new Error(`playwright-ui5: '${options.appFrame}' is not an iframe`));
    return frame;
  }

  const deadline = Date.now() + timeout;
  let shellSettled = false;
  let lastMain = { ui5: false, ushell: false };
  let lastShell: ShellState | undefined;
  for (;;) {
    const lp = await launchpadAppFrame(page, options.launchpadIframeSelector);
    if (lp) return lp;
    const child = await anyChildUI5Frame(page);
    if (child) return child;

    const main = page.mainFrame();
    lastMain = await probe(main);
    if (lastMain.ui5 && !lastMain.ushell) return main; // standalone app
    if (lastMain.ui5 && lastMain.ushell) {
      lastShell = await shellState(main);
      if (lastShell.known) {
        if (lastShell.embedded) return main; // app runs in the launchpad window
        if (lastShell.home && isHomeHash(lastShell.hash)) return main; // launchpad home page
        // app opens in an iframe or is still starting: keep looking
      } else {
        // Launchpad without AppLifeCycle info: let the shell settle once, then decide.
        if (shellSettled) return main;
        await ensureBridge(main, timeout);
        await callBridge(main, "waitForUI5", [timeout], timeout).catch(() => undefined);
        shellSettled = true;
        continue;
      }
    }
    if (Date.now() > deadline) {
      const iframes = await page.locator(options.launchpadIframeSelector).count().catch(() => 0);
      const shellInfo = lastShell?.known
        ? `launchpad reports app type=${lastShell.type ?? "none"}, embedded=${lastShell.embedded}, home=${lastShell.home}`
        : "launchpad state unknown";
      throw cleanStack(
        new Error(
          `playwright-ui5: no frame running the UI5 app found on '${page.url()}' within ${timeout}ms ` +
            `(launchpad app iframes: ${iframes}; main frame: ui5=${lastMain.ui5}, ushell=${lastMain.ushell}; ${shellInfo}). ` +
            `If the app runs in an iframe, set ui5Options.appFrame to a CSS selector of that iframe.`
        )
      );
    }
    await sleep(250);
  }
}

/** Is a previously resolved app frame still usable? */
export async function isFrameStillValid(page: Page, frame: Frame, options: ResolvedUI5Options): Promise<boolean> {
  if (frame.isDetached()) return false;
  const main = page.mainFrame();
  if (frame !== main && !(await isVisibleFrame(frame))) return false;
  const info = await probe(frame);
  if (!info.ui5) return false;
  if (frame === main && options.appFrame === "auto" && info.ushell) {
    // The launchpad frame was chosen (home page / embedded app). Still right only if no app iframe
    // has opened meanwhile and the launchpad still shows its home page or an embedded app - e.g.
    // after navigating to an intent, the app iframe may not even exist yet.
    if (await launchpadAppFrame(page, options.launchpadIframeSelector)) return false;
    const shell = await shellState(main);
    if (shell.known && !shell.embedded && !(shell.home && isHomeHash(shell.hash))) return false;
  }
  return true;
}
