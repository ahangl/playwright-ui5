import { callBridge, type ControlDescriptor, type Serialized } from "../bridge/inject";
import { errorAt, formatArgs } from "../util/step";
import type { UI5Selector } from "./selector";
import { createRemoteControl, fromBrowser, toBrowser, UI5Control, type RemoteContext } from "./remote";

/** Internals of a chain or query, used by the `expect` matchers (re-running it on every attempt). */
export const CHAIN = Symbol.for("playwright-ui5.chain");

export interface ChainInternals {
  /** Human-readable description, e.g. `ui5.control({...}).getItems(0)`. */
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

/** Where a chain starts: a control selector (`ui5.control`) or an existing remote control/object. */
export interface ChainSource {
  ctx(timeout?: number): Promise<RemoteContext>;
  start: { selector: UI5Selector } | { ref: Ref };
  /** e.g. `ui5.control({"controlType":"sap.m.Button"})` or `sap.m.Button#__button0` */
  label: string;
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
const HELPERS = new Set(["press", "enterText", "exec", "locator", "getBindingContextPath", "reload"]);

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

async function execute(source: ChainSource, steps: Step[], site: Error, timeout?: number): Promise<unknown> {
  const description = source.label + describeSteps(steps);
  let ctx: RemoteContext;
  let result: ChainResult;
  try {
    ctx = await source.ctx(timeout);
    const wireSteps = steps.map((s) => ({ m: s.m, a: toBrowser(s.a) }));
    result = await callBridge<ChainResult>(ctx.frame, "chain", [toBrowser(source.start), wireSteps, ctx.timeout], ctx.timeout);
  } catch (e) {
    throw errorAt(e instanceof Error ? e.message : String(e), site);
  }
  if (result.ok) return fromBrowser(result.value as Serialized, ctx);

  if (result.notFound && "selector" in source.start) {
    throw errorAt(
      `playwright-ui5: no control found for selector ${describeSelector(source.start.selector)} within ${ctx.timeout}ms` +
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

/**
 * A recorded chain of method calls. It runs (in one browser round trip) when it is awaited, and
 * the result is cached: awaiting the same chain object twice runs it once.
 */
export function createChain(source: ChainSource, steps: Step[], site: Error): any {
  let cached: Promise<unknown> | undefined;
  const settle = () => (cached ??= execute(source, steps, site));

  const internals: ChainInternals = {
    description: source.label + describeSteps(steps),
    kind: "chain",
    run: (options = {}) => execute(source, steps, site, options.timeout),
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
          return async (...args: unknown[]) => {
            const value = await settle();
            if (!(value instanceof UI5Control)) {
              throw errorAt(
                `playwright-ui5: ${prop}() needs a control, but ${internals.description} returned ${String(value)}`,
                new Error()
              );
            }
            return (value as any)[prop](...args);
          };
        }
        return (...args: unknown[]) => createChain(source, [...steps, { m: prop, a: args }], new Error());
      },
    }
  );
}

/** Starts a chain from an existing remote control or object (calling one of its methods). */
export function chainFrom(ctx: RemoteContext, ref: Ref, label: string, method: string, args: unknown[]): any {
  return createChain({ ctx: async (timeout) => (timeout ? { ...ctx, timeout } : ctx), start: { ref }, label }, [{ m: method, a: args }], new Error());
}

/**
 * Result of `ui5.controls()`: awaitable like a promise (cached), and re-runnable by the `expect`
 * matchers, e.g. `await expect(ui5.controls(ROW)).toHaveUI5Count(2)`.
 */
export function createControlsQuery(
  ctx: (timeout?: number) => Promise<RemoteContext>,
  selector: UI5Selector,
  site: Error
): any {
  const run = async (options: { timeout?: number } = {}) => {
    try {
      const c = await ctx(options.timeout);
      const ds = await callBridge<ControlDescriptor[]>(c.frame, "findControls", [toBrowser(selector), c.timeout], c.timeout);
      return ds.map((d) => createRemoteControl(c, d));
    } catch (e) {
      throw e instanceof Error ? errorAt(e.message, site) : e;
    }
  };
  let cached: Promise<unknown> | undefined;
  const internals: ChainInternals = {
    description: `ui5.controls(${describeSelector(selector)})`,
    kind: "controls",
    run,
  };
  return {
    [CHAIN]: internals,
    then: (onFulfilled?: any, onRejected?: any) => (cached ??= run()).then(onFulfilled, onRejected),
    catch: (onRejected?: any) => (cached ??= run()).catch(onRejected),
    finally: (onFinally?: any) => (cached ??= run()).finally(onFinally),
    toString: () => `UI5Query(${internals.description})`,
  };
}
