import { isDeepStrictEqual } from "node:util";
import { expect as baseExpect, type ExpectMatcherState, type MatcherReturnType } from "@playwright/test";
import { chainInternals } from "./control/chain";
import { UI5Control } from "./control/remote";

/** A control or something that resolves to one: `ui5.control(...)`, a chain step, a `RemoteControl`. */
type ControlLike = UI5Control | PromiseLike<UI5Control>;
type MatcherOptions = { timeout?: number };

/** Waits between attempts, like Playwright's own retrying assertions. */
const INTERVALS = [100, 250, 500, 1000];

type Attempt<T> = { ok: true; value: T } | { ok: false; error: string };

function describeReceived(received: unknown): string {
  const internals = chainInternals(received);
  if (internals) return internals.description;
  if (received instanceof UI5Control) return `${received.className}#${received.id}`;
  return String(received);
}

/** Resolves the receiver to a control for one attempt (re-running the chain/selector each time). */
async function controlOf(received: unknown, attemptTimeout: number): Promise<UI5Control> {
  if (received instanceof UI5Control) return received;
  const internals = chainInternals(received);
  if (!internals || internals.kind !== "chain") {
    throw new Error(
      "playwright-ui5: expected a control - pass ui5.control(selector), a chain like ui5.control(...).getItems(0), or a RemoteControl"
    );
  }
  const value = await internals.run({ timeout: attemptTimeout });
  if (!(value instanceof UI5Control)) {
    throw new Error(`${internals.description} returned ${String(value)}, not a control`);
  }
  return value;
}

function matches(expected: unknown, value: unknown): boolean {
  if (expected instanceof RegExp) return typeof value === "string" && expected.test(value);
  return isDeepStrictEqual(value, expected);
}

/**
 * Reads a value until `check` passes (or fails, with `.not`) or the timeout is reached. Read errors
 * (e.g. the control does not exist) count as "no match" and are retried.
 */
async function retry<T>(
  state: ExpectMatcherState,
  options: MatcherOptions | undefined,
  read: (attemptTimeout: number) => Promise<T>,
  check: (value: T) => boolean
): Promise<{ pass: boolean; last: Attempt<T>; timeout: number }> {
  const timeout = options?.timeout ?? state.timeout;
  const deadline = Date.now() + timeout;
  let last: Attempt<T> = { ok: false, error: "not checked" };
  let pass = false;
  for (let i = 0; ; i++) {
    const remaining = deadline - Date.now();
    try {
      const value = await read(Math.max(200, Math.min(remaining, 2000)));
      last = { ok: true, value };
      pass = check(value);
    } catch (e) {
      last = { ok: false, error: e instanceof Error ? e.message.split("\n")[0] : String(e) };
      pass = false;
    }
    if (pass !== state.isNot) break;
    const wait = Math.min(INTERVALS[Math.min(i, INTERVALS.length - 1)], deadline - Date.now());
    if (wait <= 0) break;
    await new Promise((r) => setTimeout(r, wait));
  }
  return { pass, last, timeout };
}

function result<T>(
  state: ExpectMatcherState,
  name: string,
  received: unknown,
  expected: unknown,
  outcome: { pass: boolean; last: Attempt<T>; timeout: number },
  expectedLabel = "Expected"
): MatcherReturnType {
  const { pass, last, timeout } = outcome;
  const utils = state.utils;
  return {
    name,
    pass,
    expected,
    actual: last.ok ? last.value : undefined,
    timeout,
    message: () =>
      [
        utils.matcherHint(name, undefined, expected === undefined ? "" : undefined, { isNot: state.isNot }),
        "",
        `Control: ${describeReceived(received)}`,
        ...(expected === undefined ? [] : [`${expectedLabel}: ${state.isNot ? "not " : ""}${utils.printExpected(expected)}`]),
        `Received: ${last.ok ? utils.printReceived(last.value) : last.error}`,
        "",
        `Timeout: ${timeout}ms`,
      ].join("\n"),
  };
}

/**
 * Playwright's `expect`, extended with retrying assertions for UI5 controls. Like Playwright's
 * locator assertions they re-run the selector/chain until the expectation is met or the
 * `expect` timeout is reached.
 *
 * @example
 * await expect(ui5.control(GO_BUTTON)).toBeUI5Enabled();
 * await expect(ui5.control(TABLE).getItems(0)).toHaveUI5BindingPath("/Books(201)");
 * await expect(ui5.controls({ controlType: "sap.m.ColumnListItem" })).toHaveUI5Count(2);
 */
export const expect = baseExpect.extend({
  /** The control's property `name` equals `expected` (deep equality; a RegExp matches strings). */
  async toHaveUI5Property(
    this: ExpectMatcherState,
    received: ControlLike,
    name: string,
    expected: unknown,
    options?: MatcherOptions
  ) {
    const outcome = await retry(
      this,
      options,
      async (t) => (await controlOf(received, t)).getProperty(name),
      (v) => matches(expected, v)
    );
    return result(this, "toHaveUI5Property", received, expected, outcome, `Expected ${name}`);
  },

  /** The control's `text` property equals `expected` (or matches the RegExp). */
  async toHaveUI5Text(this: ExpectMatcherState, received: ControlLike, expected: string | RegExp, options?: MatcherOptions) {
    const outcome = await retry(
      this,
      options,
      async (t) => (await controlOf(received, t)).getProperty("text"),
      (v) => matches(expected, v)
    );
    return result(this, "toHaveUI5Text", received, expected, outcome);
  },

  /** The control's `enabled` property is true. */
  async toBeUI5Enabled(this: ExpectMatcherState, received: ControlLike, options?: MatcherOptions) {
    const outcome = await retry(
      this,
      options,
      async (t) => (await controlOf(received, t)).getProperty("enabled"),
      (v) => v === true
    );
    return result(this, "toBeUI5Enabled", received, undefined, outcome);
  },

  /** The control is rendered, its `visible` property is not false and its DOM element has a layout box. */
  async toBeUI5Visible(this: ExpectMatcherState, received: ControlLike, options?: MatcherOptions) {
    const outcome = await retry(
      this,
      options,
      async (t) =>
        (await controlOf(received, t)).exec((c: any) => {
          const dom = typeof c.getDomRef === "function" ? c.getDomRef() : null;
          const visible = typeof c.getVisible === "function" ? c.getVisible() !== false : true;
          return !!(visible && dom && dom.getClientRects().length > 0);
        }),
      (v) => v === true
    );
    return result(this, "toBeUI5Visible", received, undefined, outcome);
  },

  /** The path of the control's binding context (optionally of a named model) equals `expected`. */
  async toHaveUI5BindingPath(
    this: ExpectMatcherState,
    received: ControlLike,
    expected: string | RegExp,
    options?: MatcherOptions & { modelName?: string }
  ) {
    const outcome = await retry(
      this,
      options,
      async (t) => (await controlOf(received, t)).getBindingContextPath(options?.modelName),
      (v) => matches(expected, v)
    );
    return result(this, "toHaveUI5BindingPath", received, expected, outcome);
  },

  /** `ui5.controls(selector)` finds exactly `expected` controls. */
  async toHaveUI5Count(
    this: ExpectMatcherState,
    received: PromiseLike<UI5Control[]>,
    expected: number,
    options?: MatcherOptions
  ) {
    const internals = chainInternals(received);
    const outcome = await retry(
      this,
      options,
      async (t) => {
        if (!internals || internals.kind !== "controls") {
          throw new Error("playwright-ui5: toHaveUI5Count() expects ui5.controls(selector)");
        }
        return ((await internals.run({ timeout: t })) as unknown[]).length;
      },
      (v) => v === expected
    );
    return result(this, "toHaveUI5Count", received, expected, outcome);
  },
});
