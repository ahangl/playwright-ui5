import type { Frame } from "@playwright/test";
import { callBridge, ensureBridge } from "../bridge/inject";
import { toBrowser } from "../control/remote";
import type { UI5 } from "../ui5";
import { errorAt, formatArgs, step } from "../util/step";
import type { FioriElementsJourney, FioriElementsKind, FioriElementsPages } from "./types";

type Step = { p: string } | { a: unknown[] };

interface RunResult {
  ok: boolean;
  error?: string;
  log: Array<{ ok: boolean; message: string }>;
}

const KIND_LABEL: Record<FioriElementsKind, string> = { given: "Given", when: "When", then: "Then" };

function pageType(config: FioriElementsPages[string]): string {
  const keys = Object.keys(config);
  if (keys.length !== 1 || !["ListReport", "ObjectPage", "Shell"].includes(keys[0])) {
    throw new Error(
      `playwright-ui5: invalid page config ${JSON.stringify(config)} - expected { ListReport | ObjectPage | Shell: {...} }`
    );
  }
  return keys[0];
}

/**
 * Makes OPA's error readable in a Playwright report: drops browser stack frames (both the trailing
 * `Callstack:` section and frames embedded in "Exception thrown by the testcode" - Playwright would
 * mistake them for the Node stack and lose the test's source snippet), drops the `Error: ...` line
 * OPA repeats right after the exception text, and collapses repeated log lines.
 */
function tidyOpaError(message: string): string {
  const withoutStack = message.split(/\n\s*Callstack:/)[0];
  const out: string[] = [];
  let previous: string | undefined;
  let repeats = 0;
  const flush = () => {
    if (repeats > 0) out.push(`    (repeated ${repeats}x)`);
    repeats = 0;
  };
  let exceptionText: string | undefined;
  for (const line of withoutStack.split("\n")) {
    if (/^\s*at\s/.test(line)) continue;
    const thrown = /Exception thrown by the testcode:'(Error: .*)$/.exec(line);
    if (thrown) exceptionText = thrown[1].trim();
    else if (exceptionText && line.trim() === exceptionText) continue;
    if (line === previous) {
      repeats++;
      continue;
    }
    flush();
    out.push(line);
    previous = line;
  }
  flush();
  return out.join("\n").trimEnd();
}

/** origin + path + hash, without the query string (may carry tokens or site parameters). */
function describeFrameUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname + u.hash;
  } catch {
    return url;
  }
}

function describeSteps(steps: Step[]): string {
  let out = "";
  for (const s of steps) {
    if ("p" in s) out += (out ? "." : "") + s.p;
    else out += `(${formatArgs(s.a)})`;
  }
  return out;
}

/**
 * Facade for the SAP Fiori elements V4 test library (`sap.fe.test`), executed inside the running
 * application (the `fe` fixture).
 *
 * @example
 * const { When, Then } = fe.init({
 *   onTheMainPage: { ListReport: { appId: "my.app", componentId: "BooksList", contextPath: "/Books" } },
 * });
 * await When.onTheMainPage.onFilterBar().iChangeSearchField("Poe").and.iExecuteSearch();
 * await Then.onTheMainPage.onTable().iCheckRows(2);
 */
export class FioriElements {
  constructor(private readonly ui5: UI5) {}

  /**
   * Declares the page objects and returns typed `Given`/`When`/`Then` roots. Nothing happens in the
   * browser until a statement is awaited; page objects are (re-)created lazily in whichever frame
   * the statement runs in (Shell pages run in the launchpad frame, all others in the app frame).
   */
  init<const P extends FioriElementsPages>(pages: P, options: { timeout?: number } = {}): FioriElementsJourney<P> {
    const types: Record<string, string> = {};
    for (const [name, config] of Object.entries(pages)) types[name] = pageType(config);
    const journey = new Journey(this.ui5, pages, types, options.timeout ?? this.ui5.options.feTimeout);
    return {
      Given: journey.root("given"),
      When: journey.root("when"),
      Then: journey.root("then")
    } as unknown as FioriElementsJourney<P>;
  }
}

class Journey {
  constructor(
    private readonly ui5: UI5,
    private readonly pages: FioriElementsPages,
    private readonly types: Record<string, string>,
    private readonly timeout: number
  ) {}

  root(kind: FioriElementsKind): object {
    return new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (typeof prop !== "string" || prop === "then") return undefined;
          if (!(prop in this.pages)) {
            throw new Error(
              `playwright-ui5: unknown page '${prop}' - configured pages: ${Object.keys(this.pages).join(", ")}`
            );
          }
          // Capture the caller's stack now (synchronously), so errors point at the test line.
          const site = new Error();
          return this.chain(kind, [{ p: prop }], site);
        }
      }
    );
  }

  private chain(kind: FioriElementsKind, steps: Step[], site: Error): unknown {
    const fn = function () {};
    return new Proxy(fn, {
      get: (_t, prop) => {
        if (prop === "then") {
          return (onFulfilled?: (v: void) => unknown, onRejected?: (e: unknown) => unknown) =>
            this.execute(kind, steps, site).then(onFulfilled, onRejected);
        }
        if (typeof prop !== "string") return undefined;
        return this.chain(kind, [...steps, { p: prop }], site);
      },
      apply: (_t, _this, args: unknown[]) => this.chain(kind, [...steps, { a: args }], site)
    });
  }

  private async frameFor(
    pageName: string
  ): Promise<{ frame: Frame; pages: Record<string, { type: string; definition?: unknown }> }> {
    const isShell = this.types[pageName] === "Shell";
    const appFrame = await this.ui5.appFrame();
    const frame = isShell ? this.ui5.shellFrame() : appFrame;
    const sameFrame = frame === appFrame && frame === this.ui5.shellFrame();
    const pages: Record<string, { type: string; definition?: unknown }> = {};
    for (const [name, config] of Object.entries(this.pages)) {
      const type = this.types[name];
      if (sameFrame || (type === "Shell") === isShell) {
        pages[name] = { type, definition: (config as Record<string, unknown>)[type] };
      }
    }
    return { frame, pages };
  }

  private async execute(kind: FioriElementsKind, steps: Step[], site: Error): Promise<void> {
    const pageName = (steps[0] as { p: string }).p;
    const title = `${KIND_LABEL[kind]} ${describeSteps(steps)}`;
    await step(
      title,
      async () => {
        const { frame, pages } = await this.frameFor(pageName);
        const timeout = this.ui5.options.waitForUI5Timeout;
        await ensureBridge(frame, timeout);
        const configKey = JSON.stringify(pages) + "|" + this.timeout;
        await callBridge(frame, "fe.init", [pages, { timeout: this.timeout, configKey }], timeout);
        const wireSteps = steps.map((s) => ("a" in s ? { a: toBrowser(s.a) } : s));
        const result = await callBridge<RunResult>(frame, "fe.run", [kind, wireSteps], timeout);
        if (!result.ok) {
          const recent = result.log
            .slice(-5)
            .map((l) => `  ${l.ok ? "✔" : "✘"} ${l.message}`)
            .join("\n");
          throw errorAt(
            `${title} failed:\n${tidyOpaError(result.error ?? "unknown error")}${recent ? `\nOPA log (last entries):\n${recent}` : ""}` +
              `\nRan in ${frame === this.ui5.shellFrame() ? "the top-level frame" : "an iframe"}: ${describeFrameUrl(frame.url())}`,
            site
          );
        }
      },
      site
    );
  }
}
