import type { Frame, Locator } from "@playwright/test";
import { callBridge, type ControlDescriptor, type Serialized } from "../bridge/inject";
import { step, formatArgs } from "../util/step";
import { chainFrom } from "./chain";

const REF = Symbol.for("playwright-ui5.ref");

/** Context shared by remote controls/objects: the frame they live in and timeouts. */
export interface RemoteContext {
  frame: Frame;
  timeout: number;
}

type Ref = { id: string } | { h: string };

// -------------------------------------------------------------------------------------------------
// Typing helpers: turn a UI5 class type (from @sapui5/types or @openui5/types) into its remote,
// promise-returning counterpart.

type Primitive = string | number | boolean | bigint | null | undefined | void;
type UI5ElementLike = { getId(): string; getMetadata(): unknown; getDomRef(...args: never[]): unknown };

/** Remote representation of a value returned by a UI5 method. */
export type Remote<R, Self = never> = [R] extends [Primitive]
  ? R
  : [R] extends [Self]
    ? RemoteControl<Self>
    : R extends Promise<infer P>
      ? Remote<P, Self>
      : R extends ReadonlyArray<infer E>
        ? Array<Remote<E>>
        : R extends UI5ElementLike
          ? RemoteControl<R>
          : R extends Date
            ? Date
            : RemoteObject<R>;

/**
 * A remote method: returns a {@link UI5Chain}. Getters of aggregations (no parameters, returning
 * an array of controls) also accept an index, like in wdi5: `table.getItems(0)`.
 */
type ChainMethod<F, T> = F extends (...args: infer A) => infer R
  ? A extends []
    ? [NonNullable<R>] extends [ReadonlyArray<infer E>]
      ? [E] extends [UI5ElementLike]
        ? ((...args: A) => UI5Chain<R, T>) & ((index: number) => UI5Chain<E>)
        : (...args: A) => UI5Chain<R, T>
      : (...args: A) => UI5Chain<R, T>
    : (...args: A) => UI5Chain<R, T>
  : never;

type Promisified<T, Exclude> = {
  [K in keyof T as K extends keyof Exclude ? never : T[K] extends (...args: any[]) => any ? K : never]: ChainMethod<T[K], T>;
};

/**
 * Methods of an untyped control/object: any method can be called and returns an untyped chain.
 * (Not `any`, so that the UI5 `expect` matchers stay available on the result.)
 */
type DynamicMethods = { [method: string]: (...args: any[]) => UntypedChain };

/** Result of a method call on an untyped control/object: awaits to `any`, can be chained further. */
export type UntypedChain = Promise<any> & ControlChainHelpers & DynamicMethods;

/** Helpers of {@link UI5Control} that can be called directly on a control chain. */
export interface ControlChainHelpers {
  /** See {@link UI5Control.press}. */
  press(options?: { native?: boolean }): Promise<void>;
  /** See {@link UI5Control.enterText}. */
  enterText(text: string, options?: { clearTextFirst?: boolean }): Promise<void>;
  /** See {@link UI5Control.exec}. */
  exec<R, A extends unknown[]>(fn: (control: any, ...args: A) => R, ...args: A): Promise<Remote<Awaited<R>>>;
  /** Playwright locator of the control (resolves the chain first). */
  locator(): Promise<Locator>;
  /** See {@link UI5Control.getBindingContextPath}. */
  getBindingContextPath(modelName?: string): Promise<string | undefined>;
  /** See {@link UI5Control.reload}. */
  reload(): Promise<RemoteControl>;
}

/** Methods available on a chain whose (non-null) result is `N`. */
type ChainMembers<N, Self> = 0 extends 1 & N
  ? DynamicMethods
  : [N] extends [never]
    ? {}
    : [N] extends [Primitive]
      ? {}
      : [N] extends [Self]
        ? ControlChainMembers<Self>
        : [N] extends [Promise<infer P>]
          ? ChainMembers<NonNullable<P>, Self>
          : [N] extends [ReadonlyArray<unknown>]
            ? {}
            : [N] extends [UI5ElementLike]
              ? ControlChainMembers<N>
              : [N] extends [Date]
                ? {}
                : unknown extends N
                  ? DynamicMethods
                  : Promisified<N, {}>;

type ControlChainMembers<T> = ControlChainHelpers & (unknown extends T ? DynamicMethods : Promisified<T, ControlChainHelpers>);

/**
 * The result of a remote method call. Await it to get the value, or keep calling methods of the
 * result - the whole chain runs in one browser round trip when awaited:
 * `await ui5.control<Table>(sel).getItems(0).getBindingContextPath()`.
 *
 * Chains are lazy: nothing happens until they are awaited.
 */
export type UI5Chain<R, Self = never> = Promise<Remote<R, Self>> & ChainMembers<NonNullable<R>, Self>;

/** Result of `ui5.control<T>()`: the control (when awaited) or a chain of its methods. */
export type ControlChain<T = unknown> = Promise<RemoteControl<T>> & ControlChainMembers<T>;

/** Result of `ui5.controls<T>()`: all matching controls when awaited. */
export type ControlsQuery<T = unknown> = Promise<RemoteControl<T>[]>;

/**
 * A UI5 control living in the browser. Besides the helpers of {@link UI5Control}, every public
 * method of the control can be called directly and returns a promise, e.g. `await button.getText()`.
 *
 * Pass the UI5 class as type parameter for typed methods: `ui5.control<Button>({...})`
 * (types from `@sapui5/types` / `@openui5/types`).
 */
export type RemoteControl<T = unknown> = UI5Control & (unknown extends T ? DynamicMethods : Promisified<T, UI5Control>);

/** A non-control UI5 object (binding context, model, ...) living in the browser. */
export type RemoteObject<T = unknown> = UI5Object & (unknown extends T ? DynamicMethods : Promisified<T, UI5Object>);

// -------------------------------------------------------------------------------------------------

export function toBrowser(value: unknown): unknown {
  if (value instanceof RegExp) return { __pwui5re: { source: value.source, flags: value.flags } };
  if (value && (typeof value === "object" || typeof value === "function") && REF in (value as object)) {
    return { __pwui5ref: (value as any)[REF] as Ref };
  }
  if (Array.isArray(value)) return value.map(toBrowser);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toBrowser(v);
    return out;
  }
  return value;
}

export function fromBrowser(value: Serialized, ctx: RemoteContext): unknown {
  switch (value.t) {
    case "u":
      return undefined;
    case "v":
      return value.v;
    case "d":
      return new Date(value.v);
    case "a":
      return value.v.map((v) => fromBrowser(v, ctx));
    case "c":
      return createRemoteControl(ctx, value.d);
    case "o":
      return createRemoteObject(ctx, value.h, value.className, value.methods);
  }
}

function withDynamicMethods<T extends { methods: readonly string[]; call(name: string, ...args: unknown[]): unknown }>(
  target: T
): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (prop in t) return Reflect.get(t, prop, receiver);
      if (typeof prop === "string" && t.methods.includes(prop)) {
        return (...args: unknown[]) => t.call(prop, ...args);
      }
      return undefined;
    },
  });
}


export class UI5Control {
  /** Global id of the control. */
  readonly id: string;
  /** Fully qualified UI5 class name, e.g. `sap.m.Button`. */
  readonly className: string;
  /** Id of the control's root DOM element (null while not rendered). */
  readonly domRefId: string | null;
  /** Names of the public methods of the control. */
  readonly methods: readonly string[];

  constructor(
    private readonly ctx: RemoteContext,
    descriptor: ControlDescriptor
  ) {
    this.id = descriptor.id;
    this.className = descriptor.className;
    this.domRefId = descriptor.domRefId;
    this.methods = descriptor.methods;
    Object.defineProperty(this, REF, { value: { id: this.id }, enumerable: false });
  }

  /** The frame the control lives in. */
  get frame(): Frame {
    return this.ctx.frame;
  }

  /**
   * Playwright locator for the control's root DOM element. Use it for native interactions,
   * `expect(...).toBeVisible()`, screenshots, etc.
   */
  locator(): Locator {
    const id = (this.domRefId ?? this.id).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return this.ctx.frame.locator(`[id="${id}"]`);
  }

  /** Calls any method of the control in the browser. Returns a chain (see {@link UI5Chain}). */
  call<R = unknown>(method: string, ...args: unknown[]): Promise<R> {
    return chainFrom(this.ctx, { id: this.id }, `${this.className}#${this.id}`, method, args);
  }

  getProperty<R = unknown>(name: string): Promise<R> {
    return this.call<R>("getProperty", name);
  }

  async setProperty(name: string, value: unknown): Promise<void> {
    await this.call("setProperty", name, value);
  }

  /** Returns the aggregated control(s); arrays for multiple aggregations. */
  getAggregation<R = RemoteControl | RemoteControl[] | undefined>(name: string): Promise<R> {
    return this.call<R>("getAggregation", name);
  }

  /** Path of the control's binding context (`getBindingContext(model).getPath()`). */
  async getBindingContextPath(modelName?: string): Promise<string | undefined> {
    return this.ctx.frame.evaluate(
      ({ id, modelName }) => {
        const ctl = (window as any).__pwui5.byId(id);
        const bc = ctl && ctl.getBindingContext(modelName);
        return bc ? (bc.getPath() as string) : undefined;
      },
      { id: this.id, modelName }
    );
  }

  /**
   * Presses the control the way OPA does (`sap/ui/test/actions/Press` via RecordReplay), which
   * picks the right inner DOM element (e.g. the search icon of a SearchField).
   * With `{ native: true }` a real Playwright click on the control's DOM element is done instead.
   */
  async press(options: { native?: boolean } = {}): Promise<void> {
    await step(`ui5: press ${this.className}#${this.id}`, async () => {
      if (options.native) {
        await callBridge(this.ctx.frame, "waitForUI5", [this.ctx.timeout], this.ctx.timeout);
        await this.locator().click();
      } else {
        await callBridge(this.ctx.frame, "interact", [this.id, "PRESS", undefined, false, this.ctx.timeout], this.ctx.timeout);
      }
    });
  }

  /**
   * Enters text the way OPA does (`EnterText` action: focuses, types, fires change).
   * `clearTextFirst` defaults to true.
   */
  async enterText(text: string, options: { clearTextFirst?: boolean } = {}): Promise<void> {
    await step(`ui5: enter "${text}" into ${this.className}#${this.id}`, async () => {
      await callBridge(
        this.ctx.frame,
        "interact",
        [this.id, "ENTER_TEXT", text, options.clearTextFirst ?? true, this.ctx.timeout],
        this.ctx.timeout
      );
    });
  }

  /**
   * Runs a function in the browser with the UI5 control as first argument. The function is
   * serialized, so it cannot use variables from the test scope - pass them as arguments.
   * Return values are transferred like method results (controls become remote controls).
   */
  async exec<R, A extends unknown[]>(fn: (control: any, ...args: A) => R, ...args: A): Promise<Remote<Awaited<R>>> {
    await callBridge(this.ctx.frame, "waitForUI5", [this.ctx.timeout], this.ctx.timeout);
    const result = await this.ctx.frame.evaluate(execExpression(fn, [{ __pwui5ref: { id: this.id } }, ...args]));
    return fromBrowser(result as Serialized, this.ctx) as Remote<Awaited<R>>;
  }

  /** Re-reads id/className/DOM ref (e.g. after re-rendering) and returns a fresh instance. */
  async reload(): Promise<RemoteControl> {
    const d = await callBridge<ControlDescriptor>(this.ctx.frame, "describeTarget", [{ id: this.id }], this.ctx.timeout);
    return createRemoteControl(this.ctx, d);
  }

  toString(): string {
    return `UI5Control(${this.className}#${this.id})`;
  }

  /** Readable output in Playwright error messages / console.log. */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.toString();
  }
}

export class UI5Object {
  readonly handle: string;
  readonly className: string;
  readonly methods: readonly string[];

  constructor(
    private readonly ctx: RemoteContext,
    handle: string,
    className: string,
    methods: string[]
  ) {
    this.handle = handle;
    this.className = className;
    this.methods = methods;
    Object.defineProperty(this, REF, { value: { h: handle }, enumerable: false });
  }

  /** Calls any method of the object in the browser. Returns a chain (see {@link UI5Chain}). */
  call<R = unknown>(method: string, ...args: unknown[]): Promise<R> {
    return chainFrom(this.ctx, { h: this.handle }, this.className, method, args);
  }

  /** Frees the browser-side reference. */
  async release(): Promise<void> {
    await callBridge(this.ctx.frame, "release", [[this.handle]], this.ctx.timeout).catch(() => undefined);
  }

  toString(): string {
    return `UI5Object(${this.className})`;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.toString();
  }
}

/**
 * Builds a self-contained expression that calls `fn` with the given args in the page and returns
 * the serialized result. Evaluated as a Playwright expression (via CDP), so it is not subject to
 * the page's Content-Security-Policy (no `eval` inside the page).
 */
export function execExpression(fn: (...args: any[]) => unknown, args: unknown[]): string {
  const payload = JSON.stringify(toBrowser(args));
  return `(async () => {
    const __b = window.__pwui5;
    const __f = (${fn.toString()});
    const __v = await __f(...__b.deser(${payload}));
    return __b.ser(__v);
  })()`;
}

export function createRemoteControl<T = unknown>(ctx: RemoteContext, d: ControlDescriptor): RemoteControl<T> {
  return withDynamicMethods(new UI5Control(ctx, d)) as RemoteControl<T>;
}

export function createRemoteObject<T = unknown>(
  ctx: RemoteContext,
  handle: string,
  className: string,
  methods: string[]
): RemoteObject<T> {
  return withDynamicMethods(new UI5Object(ctx, handle, className, methods)) as RemoteObject<T>;
}

export { formatArgs };
