/* eslint-disable @typescript-eslint/no-explicit-any -- UI5 objects in the browser are untyped. */
import { callBridge, type ControlDescriptor, type Serialized } from "../bridge/inject";
import { enterTextTitle, errorAt, formatArgs, step, withoutSteps } from "../util/step";
import type { UI5Selector } from "./selector";
import { contextOf, createRemoteControl, fromBrowser, toBrowser, UI5Control, type RemoteContext } from "./remote";

/** Internals of a chain or query, used by the `expect` matchers (re-running it on every attempt). */
export const CHAIN = Symbol.for("playwright-ui5.chain");

export interface ChainInternals {
  /** Human-readable description, for example, `ui5.control({...}).getItems(0)`. */
  readonly description: string;
  /** `"controls"` for `ui5.controls()` queries (resolve to an array of controls). */
  readonly kind: "chain" | "controls";
  /** Runs the chain/query again (not cached). `timeout` overrides the wait for UI5 / the control. */
  run(options?: { timeout?: number }): Promise<unknown>;
}

export function chainInternals(value: unknown): ChainInternals | undefined {
  return value && (typeof value === "object" || typeof value === "function")
    ? ((value as Record<symbol, ChainInternals | undefined>)[CHAIN] ?? undefined)
    : undefined;
}

type Ref = { id: string } | { h: string };
type Start = { selector: UI5Selector } | { ref: Ref };

/** Where a chain starts: a control selector (`ui5.control`) or an existing remote control/object. */
export interface ChainSource {
  /**
   * Frame/timeouts and the start of the chain. Called when the chain runs; it may first wait for
   * something (for example, a `press()` that the chain continues after).
   */
  resolve(timeout?: number): Promise<{ ctx: RemoteContext; start: Start }>;
  /** for example `ui5.control({"controlType":"sap.m.Button"})` or `sap.m.Button#__button0` */
  label: string;
  /**
   * The value of the chain while it has no steps, without a step of its own - for example the control an
   * action (`press()`) was done on. Only used for `await chain`; re-runs (`expect` matchers) always
   * go to the browser.
   */
  value?: () => Promise<unknown>;
}

interface Step {
  m: string;
  a: unknown[];
}

interface Hop {
  type: string;
  id?: string;
  length?: number;
}

interface ChainResult {
  ok: boolean;
  value?: Serialized;
  failedAt?: number;
  notFound?: boolean;
  error?: string;
  hops: Hop[];
}

/** Helpers of {@link UI5Control} that are available on a control chain (they resolve it first). */
const HELPERS = new Set(["exec", "locator", "getBindingContextPath", "reload"]);
/** Actions: they run right away, and the chain continues on the same control afterwards. */
const ACTIONS = new Set(["press", "enterText"]);

export function describeSelector(selector: UI5Selector): string {
  try {
    return JSON.stringify(toBrowser(selector), (_k, v) =>
      v && typeof v === "object" && "__pwui5re" in v ? `/${v.__pwui5re.source}/${v.__pwui5re.flags}` : v
    );
  } catch {
    return String(selector);
  }
}

function describeSteps(steps: Step[]): string {
  return steps.map((s) => `.${s.m}(${formatArgs(s.a)})`).join("");
}

function describeHop(hop: Hop | undefined): string {
  if (!hop) return "?";
  if (hop.id) return `${hop.type}#${hop.id}`;
  if (hop.length !== undefined) return `${hop.type}(${hop.length})`;
  return hop.type;
}

/** Runs a chain as a step (titled like the chain, located at the caller's line). */
async function execute(source: ChainSource, steps: Step[], site: Error, timeout?: number): Promise<unknown> {
  return step(source.label + describeSteps(steps), () => runChain(source, steps, site, timeout), site);
}

async function runChain(source: ChainSource, steps: Step[], site: Error, timeout?: number): Promise<unknown> {
  const description = source.label + describeSteps(steps);
  let ctx: RemoteContext;
  let start: Start;
  let result: ChainResult;
  try {
    ({ ctx, start } = await source.resolve(timeout));
    const wireSteps = steps.map((s) => ({ m: s.m, a: toBrowser(s.a) }));
    result = await callBridge<ChainResult>(ctx.frame, "chain", [toBrowser(start), wireSteps, ctx.timeout], ctx.timeout);
  } catch (e) {
    throw errorAt(e instanceof Error ? e.message : String(e), site);
  }
  if (result.ok) return fromBrowser(result.value as Serialized, ctx);

  if (result.notFound && "selector" in start) {
    throw errorAt(
      `playwright-ui5: no control found for selector ${describeSelector(start.selector)} within ${ctx.timeout}ms` +
        (steps.length ? `\n  in ${description}` : ""),
      site
    );
  }
  const failedAt = result.failedAt ?? -1;
  if (failedAt < 0 || steps.length === 0) {
    throw errorAt(result.error ?? "playwright-ui5: unknown error", site);
  }
  const lines = [`playwright-ui5: ${description} failed at .${steps[failedAt].m}(${formatArgs(steps[failedAt].a)}):`];
  lines.push(`  ${result.error ?? "unknown error"}`);
  lines.push(`  ✔ ${source.label} → ${describeHop(result.hops[0])}`);
  for (let i = 0; i < failedAt; i++) {
    lines.push(`  ✔ ${steps[i].m}(${formatArgs(steps[i].a)}) → ${describeHop(result.hops[i + 1])}`);
  }
  lines.push(`  ✘ ${steps[failedAt].m}(${formatArgs(steps[failedAt].a)})`);
  throw errorAt(lines.join("\n"), site);
}

/** `source.value()`, with errors pointing at the caller's line like those of `runChain`. */
async function valueOf(source: ChainSource, site: Error): Promise<unknown> {
  try {
    return await source.value!();
  } catch (e) {
    throw errorAt(e instanceof Error ? e.message : String(e), site);
  }
}

/**
 * The control after an action, freshly described (the action may have re-rendered it). If the
 * action destroyed it (for example, the OK button of a dialog), the old description is kept.
 */
export function refreshed(control: UI5Control): Promise<UI5Control> {
  return withoutSteps(() => control.reload()).catch(() => control);
}

function withTimeout(ctx: RemoteContext, timeout?: number): RemoteContext {
  return timeout ? { ...ctx, timeout } : ctx;
}

/**
 * A recorded chain of method calls. It runs (in one browser round trip) when it is awaited, and
 * the result is cached: awaiting the same chain object twice runs it once.
 */
export function createChain(source: ChainSource, steps: Step[], site: Error): any {
  let cached: Promise<unknown> | undefined;
  const settle = () =>
    (cached ??= !steps.length && source.value ? valueOf(source, site) : execute(source, steps, site));

  const internals: ChainInternals = {
    description: source.label + describeSteps(steps),
    kind: "chain",
    run: (options = {}) => execute(source, steps, site, options.timeout)
  };

  /** Resolves the chain and checks that it ends at a control (for helpers and actions). */
  const control = async (helper: string): Promise<UI5Control> => {
    const value = await settle();
    if (!(value instanceof UI5Control)) {
      throw errorAt(
        `playwright-ui5: ${helper}() needs a control, but ${internals.description} returned ${String(value)}`,
        site
      );
    }
    return value;
  };

  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === CHAIN) return internals;
        if (prop === "then" || prop === "catch" || prop === "finally") {
          const p = settle();
          return (p as any)[prop].bind(p);
        }
        if (prop === "toString" || prop === Symbol.for("nodejs.util.inspect.custom")) {
          return () => `UI5Chain(${internals.description})`;
        }
        if (typeof prop !== "string") return undefined;
        if (HELPERS.has(prop)) {
          return (...args: unknown[]) => {
            const helperSite = new Error();
            // One step for resolving the chain and the helper (for example, `....getBindingContextPath()`).
            return step(
              `${internals.description}.${prop}(${formatArgs(args)})`,
              () => withoutSteps(async () => ((await control(prop)) as any)[prop](...args)),
              helperSite
            );
          };
        }
        if (ACTIONS.has(prop)) {
          return (...args: unknown[]) => {
            const actionSite = new Error();
            const title =
              prop === "press" ? `ui5: press ${internals.description}` : enterTextTitle(args[0], internals.description);
            // Start right away (like UI5Control.press), as one step for the lookup and the action.
            // The returned chain continues on the same control afterwards.
            const acted = step(
              title,
              () =>
                withoutSteps(async () => {
                  const c = await control(prop);
                  // resolves to the freshly described control (see chainAfter)
                  return (await (c as any)[prop](...args)) as UI5Control;
                }),
              actionSite
            );
            return createChain(
              {
                label: `${internals.description}.${prop}(${formatArgs(args)})`,
                value: () => acted,
                resolve: async (timeout) => {
                  const c = await acted;
                  return { ctx: withTimeout(contextOf(c), timeout), start: { ref: { id: c.id } } };
                }
              },
              [],
              actionSite
            );
          };
        }
        return (...args: unknown[]) => createChain(source, [...steps, { m: prop, a: args }], new Error());
      }
    }
  );
}

/** Starts a chain from an existing remote control or object (calling one of its methods). */
export function chainFrom(ctx: RemoteContext, ref: Ref, label: string, method: string, args: unknown[]): any {
  return createChain(
    { label, resolve: async (timeout) => ({ ctx: withTimeout(ctx, timeout), start: { ref } }) },
    [{ m: method, a: args }],
    new Error()
  );
}

/**
 * A chain on a control that continues after `before` (an action that already started and
 * resolves to the control afterwards), for example, the result of `control.press()`.
 */
export function chainAfter(label: string, before: Promise<UI5Control>): any {
  return createChain(
    {
      label,
      value: () => before,
      resolve: async (timeout) => {
        const c = await before;
        return { ctx: withTimeout(contextOf(c), timeout), start: { ref: { id: c.id } } };
      }
    },
    [],
    new Error()
  );
}

/**
 * Result of `ui5.controls()`: awaitable like a promise (cached), and re-runnable by the `expect`
 * matchers, for example, `await expect(ui5.controls(ROW)).toHaveUI5Count(2)`.
 */
export function createControlsQuery(
  ctx: (timeout?: number) => Promise<RemoteContext>,
  selector: UI5Selector,
  site: Error,
  labelPrefix = "ui5"
): any {
  const description = `${labelPrefix}.controls(${describeSelector(selector)})`;
  const run = (options: { timeout?: number } = {}) =>
    step(
      description,
      async () => {
        try {
          const c = await ctx(options.timeout);
          const ds = await callBridge<ControlDescriptor[]>(
            c.frame,
            "findControls",
            [toBrowser(selector), c.timeout],
            c.timeout
          );
          return ds.map((d) => createRemoteControl(c, d));
        } catch (e) {
          throw e instanceof Error ? errorAt(e.message, site) : e;
        }
      },
      site
    );
  let cached: Promise<unknown> | undefined;
  const internals: ChainInternals = {
    description,
    kind: "controls",
    run
  };
  return {
    [CHAIN]: internals,
    then: (onFulfilled?: any, onRejected?: any) => (cached ??= run()).then(onFulfilled, onRejected),
    catch: (onRejected?: any) => (cached ??= run()).catch(onRejected),
    finally: (onFinally?: any) => (cached ??= run()).finally(onFinally),
    toString: () => `UI5Query(${internals.description})`
  };
}
