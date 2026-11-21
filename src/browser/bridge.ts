/**
 * Browser-side bridge. Bundled as an IIFE and injected into the frame that hosts the UI5 app
 * (and, for Shell page objects, into the launchpad frame). Exposes `window.__pwui5`.
 *
 * Everything that crosses the Node <-> browser boundary is plain JSON. UI5 objects stay in the
 * browser and are referenced by control id (elements) or by a handle id (any other object).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

declare const sap: any;

type Serialized =
  | { t: "u" }
  | { t: "v"; v: unknown }
  | { t: "d"; v: string }
  | { t: "a"; v: Serialized[] }
  | { t: "c"; d: ControlDescriptor }
  | { t: "o"; h: string; className: string; methods: string[] };

interface ControlDescriptor {
  id: string;
  className: string;
  domRefId: string | null;
  methods: string[];
}

type ChainStart = { selector: unknown } | { ref: { id?: string; h?: string } };

interface ChainStep {
  m: string;
  a: unknown[];
}

/** What the start or a step of a chain returned. */
interface Hop {
  type: string;
  id?: string;
  length?: number;
}

interface ChainResult {
  ok: boolean;
  value?: Serialized;
  /** Index of the failing step; -1 when resolving the start failed. */
  failedAt?: number;
  notFound?: boolean;
  error?: string;
  /** One entry for the start and each step that ran successfully. */
  hops: Hop[];
}

interface FEPageSpec {
  type: string;
  definition?: Record<string, unknown>;
}

interface LogEntry {
  ok: boolean;
  message: string;
}

const BRIDGE_VERSION = "1";

(function () {
  const w = window as any;
  if (w.__pwui5 && w.__pwui5.bridgeVersion === BRIDGE_VERSION) {
    return;
  }

  const M: Record<string, any> = {};
  const handles = new Map<string, unknown>();
  const methodCache = new Map<string, string[]>();
  let handleSeq = 0;

  function requireAsync(names: string[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      sap.ui.require(names, (...mods: any[]) => resolve(mods), reject);
    });
  }

  function coreReady(): Promise<void> {
    const Core = M.Core;
    if (Core && typeof Core.ready === "function") {
      return Core.ready();
    }
    const core = sap.ui.getCore();
    if (core.isInitialized && core.isInitialized()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => core.attachInit(resolve));
  }

  const ready: Promise<void> = requireAsync([
    "sap/ui/test/RecordReplay",
    "sap/ui/core/Element",
    "sap/ui/core/Core"
  ]).then(([RecordReplay, Element, Core]) => {
    M.RecordReplay = RecordReplay;
    M.Element = Element;
    M.Core = Core;
    return coreReady();
  });

  // ---------------------------------------------------------------------------------------------
  // helpers

  function byId(id: string): any {
    const E = M.Element;
    if (E && typeof E.getElementById === "function") return E.getElementById(id);
    if (E && E.registry) return E.registry.get(id);
    return sap.ui.getCore().byId(id);
  }

  function controlFromDom(el: Element): any {
    const E = M.Element;
    if (E && typeof E.closestTo === "function") return E.closestTo(el);
    return w.jQuery(el).control(0);
  }

  function methodsOf(obj: any): string[] {
    const className = obj && typeof obj.getMetadata === "function" ? obj.getMetadata().getName() : undefined;
    if (className && methodCache.has(className)) return methodCache.get(className)!;
    const names = new Set<string>();
    let proto = Object.getPrototypeOf(obj);
    while (proto && proto !== Object.prototype) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === "constructor" || name.startsWith("_") || name === "then") continue;
        const desc = Object.getOwnPropertyDescriptor(proto, name);
        if (desc && typeof desc.value === "function") names.add(name);
      }
      proto = Object.getPrototypeOf(proto);
    }
    const result = [...names].sort();
    if (className) methodCache.set(className, result);
    return result;
  }

  /** `interactionEl`: the DOM element matched by a selector with `interaction` (instead of the root). */
  function describe(control: any, interactionEl?: Element | null): ControlDescriptor {
    const dom = interactionEl ?? (typeof control.getDomRef === "function" ? control.getDomRef() : null);
    return {
      id: control.getId(),
      className: control.getMetadata().getName(),
      domRefId: dom && dom.id ? dom.id : null,
      methods: methodsOf(control)
    };
  }

  function isPlainObject(v: unknown): v is Record<string, unknown> {
    if (v === null || typeof v !== "object") return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
  }

  function ser(v: unknown, depth = 0): Serialized {
    if (v === undefined || typeof v === "function" || typeof v === "symbol") return { t: "u" };
    if (v === null || typeof v !== "object") {
      return typeof v === "bigint" ? { t: "v", v: String(v) } : { t: "v", v };
    }
    if (M.Element && v instanceof M.Element) return { t: "c", d: describe(v) };
    if (v instanceof Date) return { t: "d", v: v.toISOString() };
    if (Array.isArray(v) && depth < 3) return { t: "a", v: v.map((x) => ser(x, depth + 1)) };
    if (isPlainObject(v) || Array.isArray(v)) {
      try {
        return { t: "v", v: JSON.parse(JSON.stringify(v)) };
      } catch {
        // cyclic or otherwise not JSON-able -> keep it as a handle
      }
    }
    const h = "h" + ++handleSeq;
    handles.set(h, v);
    const anyV = v as any;
    const className =
      typeof anyV.getMetadata === "function"
        ? anyV.getMetadata().getName()
        : (Object.getPrototypeOf(v)?.constructor?.name ?? "Object");
    return { t: "o", h, className, methods: methodsOf(v) };
  }

  function deser(v: any): any {
    if (Array.isArray(v)) return v.map(deser);
    if (!isPlainObject(v)) return v;
    if ("__pwui5re" in v) {
      const re = v.__pwui5re as { source: string; flags: string };
      return new RegExp(re.source, re.flags);
    }
    if ("__pwui5ref" in v) {
      return resolveTarget(v.__pwui5ref as Target);
    }
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = deser(val);
    return out;
  }

  type Target = { id?: string; h?: string };

  function resolveTarget(target: Target): any {
    if (target.h) {
      if (!handles.has(target.h))
        throw new Error(`playwright-ui5: object handle ${target.h} is no longer available (page reloaded?)`);
      return handles.get(target.h);
    }
    const ctl = byId(target.id!);
    if (!ctl) throw new Error(`playwright-ui5: control '${target.id}' does not exist (anymore)`);
    return ctl;
  }

  function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function errMessage(e: any): string {
    if (!e) return "Unknown error";
    if (typeof e === "string") return e;
    return e.errorMessage || e.message || String(e);
  }

  // ---------------------------------------------------------------------------------------------
  // control API

  async function waitForUI5(timeout: number): Promise<void> {
    await ready;
    await M.RecordReplay.waitForUI5({ timeout, interval: 100 });
  }

  interface Match {
    ctl: any;
    /** DOM element matched by a selector with `interaction`, otherwise null. */
    interactionEl: Element | null;
  }

  /**
   * RecordReplay returns the DOM element it would interact with - by default ("auto") that can be
   * an element of a child control (for example, the growing trigger of a sap.m.Table). Asking for the root
   * element makes the DOM -> control mapping return the matched control itself.
   */
  function rootSelector(sel: any): any {
    return sel && typeof sel === "object" ? { ...sel, interaction: "root" } : sel;
  }

  /** Polls until a control matches (or the timeout is reached). Returns null if nothing matches. */
  async function findMatch(selector: any, timeout: number): Promise<Match | null> {
    await ready;
    const deadline = Date.now() + timeout;
    const sel = deser(selector);
    let lastError: unknown;
    do {
      let ctl: any;
      try {
        await M.RecordReplay.waitForUI5({ timeout: Math.max(deadline - Date.now(), 1000), interval: 100 });
        const el = await M.RecordReplay.findDOMElementByControlSelector({ selector: rootSelector(sel) });
        ctl = el && controlFromDom(el);
      } catch (e) {
        lastError = e;
      }
      if (ctl) {
        // outside of the retry: a control without the requested element is an error of its own
        return { ctl, interactionEl: sel && sel.interaction ? await interactionElement(ctl, sel.interaction) : null };
      }
      await sleep(200);
    } while (Date.now() < deadline);
    if (lastError && !/no dom element found|could not find/i.test(errMessage(lastError))) {
      throw new Error(errMessage(lastError));
    }
    return null;
  }

  /** The DOM element of `ctl` that a selector's `interaction` designates; throws a clear error if there is none. */
  async function interactionElement(ctl: any, interaction: unknown): Promise<Element> {
    let el: Element | null = null;
    let reason = "";
    try {
      el = await M.RecordReplay.findDOMElementByControlSelector({ selector: { id: ctl.getId(), interaction } });
    } catch (e) {
      reason = errMessage(e);
    }
    if (!el) {
      const what = typeof interaction === "string" ? interaction : JSON.stringify(interaction);
      throw new Error(
        `playwright-ui5: control ${typeName(ctl)}#${ctl.getId()} has no '${what}' element for interaction` +
          (reason ? ` (${reason})` : "")
      );
    }
    return el;
  }

  async function findControl(selector: any, timeout: number): Promise<ControlDescriptor | null> {
    const match = await findMatch(selector, timeout);
    return match ? describe(match.ctl, match.interactionEl) : null;
  }

  async function findControls(selector: any, timeout: number): Promise<ControlDescriptor[]> {
    await waitForUI5(timeout);
    const RR = M.RecordReplay;
    if (typeof RR.findAllDOMElementsByControlSelector !== "function") {
      throw new Error("playwright-ui5: findAll requires UI5 >= 1.80");
    }
    const sel = deser(selector);
    const els: Element[] = await RR.findAllDOMElementsByControlSelector({ selector: rootSelector(sel) });
    const seen = new Set<string>();
    const out: ControlDescriptor[] = [];
    for (const el of els) {
      const ctl = controlFromDom(el);
      if (ctl && !seen.has(ctl.getId())) {
        seen.add(ctl.getId());
        const interactionEl = sel && sel.interaction ? await interactionElement(ctl, sel.interaction) : null;
        out.push(describe(ctl, interactionEl));
      }
    }
    return out;
  }

  async function describeTarget(target: Target): Promise<ControlDescriptor> {
    await ready;
    return describe(resolveTarget(target));
  }

  function typeName(v: any): string {
    if (v === null) return "null";
    if (typeof v !== "object" && typeof v !== "function") return typeof v;
    if (typeof v.getMetadata === "function") return v.getMetadata().getName();
    if (Array.isArray(v)) return "Array";
    return Object.getPrototypeOf(v)?.constructor?.name ?? "Object";
  }

  /** What a chain step returned, for error messages. */
  function hopOf(v: any): Hop {
    if (v === undefined || v === null) return { type: String(v) };
    const hop: Hop = { type: typeName(v) };
    if (M.Element && v instanceof M.Element) hop.id = v.getId();
    if (Array.isArray(v)) hop.length = v.length;
    return hop;
  }

  /**
   * wdi5-style index shortcut: `getItems(0)` on a multiple aggregation returns the item at that
   * index (UI5's own getter takes no arguments).
   */
  function aggregationIndex(obj: any, method: string, args: unknown[]): number | undefined {
    if (args.length !== 1 || typeof args[0] !== "number" || !/^get[A-Z]/.test(method)) return undefined;
    if (!obj || typeof obj.getMetadata !== "function") return undefined;
    const meta = obj.getMetadata();
    const name = method.charAt(3).toLowerCase() + method.slice(4);
    const aggregation = typeof meta.getAllAggregations === "function" ? meta.getAllAggregations()[name] : undefined;
    return aggregation && aggregation.multiple ? (args[0] as number) : undefined;
  }

  /**
   * Resolves `start` (a control selector or a reference to a control/object), then calls the
   * steps one after the other on the previous result - all in one round trip. Failures are
   * returned (not thrown) together with what every step returned, so the caller can show them.
   */
  async function chain(start: ChainStart, steps: ChainStep[], timeout: number): Promise<ChainResult> {
    let current: any;
    let interactionEl: Element | null = null;
    const hops: Hop[] = [];
    try {
      if ("selector" in start) {
        const match = await findMatch(start.selector, timeout);
        if (!match) return { ok: false, notFound: true, failedAt: -1, error: "no control found", hops };
        current = match.ctl;
        interactionEl = match.interactionEl;
      } else {
        await waitForUI5(timeout);
        current = resolveTarget(start.ref);
      }
    } catch (e) {
      return { ok: false, failedAt: -1, error: errMessage(e), hops };
    }
    hops.push(hopOf(current));

    for (let i = 0; i < steps.length; i++) {
      const { m, a } = steps[i];
      if (current === undefined || current === null) {
        return { ok: false, failedAt: i, error: `previous step returned ${current}, nothing to call ${m}() on`, hops };
      }
      try {
        const args = deser(a) as unknown[];
        const fn = current[m];
        if (typeof fn !== "function") {
          return { ok: false, failedAt: i, error: `'${m}' is not a function on ${typeName(current)}`, hops };
        }
        const index = aggregationIndex(current, m, args);
        let result: any;
        if (index !== undefined) {
          const all = fn.call(current) || [];
          if (index < 0 || index >= all.length) {
            return {
              ok: false,
              failedAt: i,
              error: `index ${index} out of range (${m}() returned ${all.length} items)`,
              hops
            };
          }
          result = all[index];
        } else {
          result = fn.apply(current, args);
          if (result && typeof result.then === "function") result = await result;
        }
        current = result;
        interactionEl = null;
      } catch (e) {
        return { ok: false, failedAt: i, error: errMessage(e), hops };
      }
      hops.push(hopOf(current));
    }

    const value =
      interactionEl && M.Element && current instanceof M.Element
        ? ({ t: "c", d: describe(current, interactionEl) } as Serialized)
        : ser(current);
    return { ok: true, value, hops };
  }

  /** Router navigation (`getRouter().navTo`) on the given or the only application component. */
  async function navTo(
    route: string,
    params: Record<string, unknown> | undefined,
    componentId: string | undefined,
    replace: boolean,
    componentTargetInfo: Record<string, unknown> | undefined,
    timeout: number
  ): Promise<void> {
    await waitForUI5(timeout);
    const [Component] = await requireAsync(["sap/ui/core/Component"]);
    const byComponentId = (id: string) =>
      typeof Component.getComponentById === "function" ? Component.getComponentById(id) : Component.get(id);
    const all: any[] = Component.registry
      ? typeof Component.registry.filter === "function"
        ? Component.registry.filter(() => true)
        : Object.values(Component.registry.all())
      : [];
    const routed = all.filter((c) => typeof c.getRouter === "function" && c.getRouter());
    let component: any;
    if (componentId) {
      component = byComponentId(componentId);
      if (!component) throw new Error(`playwright-ui5: component '${componentId}' does not exist`);
    } else {
      const apps = routed.filter(
        (c) => typeof c.getManifestEntry === "function" && c.getManifestEntry("/sap.app/type") === "application"
      );
      const candidates = apps.length ? apps : routed;
      if (candidates.length !== 1) {
        throw new Error(
          `playwright-ui5: goTo({ route }) needs a componentId - ${candidates.length} components with a router found` +
            (candidates.length ? `: ${candidates.map((c) => c.getId()).join(", ")}` : "")
        );
      }
      component = candidates[0];
    }
    const router = typeof component.getRouter === "function" ? component.getRouter() : undefined;
    if (!router) throw new Error(`playwright-ui5: component '${component.getId()}' has no router`);
    if (!router.getRoute(route)) {
      const known = Object.keys(router._oRoutes || {});
      throw new Error(
        `playwright-ui5: route '${route}' does not exist in component '${component.getId()}'` +
          (known.length ? ` - routes: ${known.join(", ")}` : "")
      );
    }
    router.navTo(route, params || {}, componentTargetInfo, replace);
  }

  async function interact(
    id: string,
    type: "PRESS" | "ENTER_TEXT",
    text: string | undefined,
    clearTextFirst: boolean,
    timeout: number
  ): Promise<void> {
    await waitForUI5(timeout);
    // Actionability: wait until the control is visible, enabled, not busy and not covered by a
    // popup - like Playwright does for its own actions (RecordReplay alone would press anyway).
    const target = await findControl({ id, interactable: true }, timeout);
    if (!target) {
      const ctl = byId(id);
      const state = ctl
        ? `visible=${ctl.getVisible?.()}, enabled=${ctl.getEnabled?.()}, busy=${ctl.getBusy?.()}`
        : "control does not exist";
      throw new Error(
        `playwright-ui5: control '${id}' is not interactable within ${timeout}ms (${state}; or covered by a dialog/popover)`
      );
    }
    await M.RecordReplay.interactWithControl({
      selector: { id },
      interactionType: type,
      enterText: text,
      clearTextFirst
    });
  }

  // ---------------------------------------------------------------------------------------------
  // requests that are not waited for (wdi5's `ignoreAutoWaitUrls`)

  let ignorePatterns: RegExp[] = [];
  let requestPatchesInstalled = false;

  function isIgnoredUrl(url: unknown): boolean {
    const s = String(url);
    return ignorePatterns.some((re) => {
      re.lastIndex = 0;
      return re.test(s);
    });
  }

  /**
   * - XHR: OPA's `_XHRWaiter` skips requests whose `ignored` flag is set when `send()` runs, so our
   *   `open()` wrapper sets it - regardless of the order in which the wrappers were installed.
   * - fetch: OPA's `_fetchWaiter` wraps `window.fetch`; ignored URLs bypass it and go to the
   *   browser's own fetch, saved before UI5 loaded (see the `ui5` fixture).
   */
  async function configure(config: { ignoreAutoWaitUrls: Array<{ source: string; flags: string }> }): Promise<void> {
    await ready;
    ignorePatterns = config.ignoreAutoWaitUrls.map((p) => new RegExp(p.source, p.flags));
    if (requestPatchesInstalled || !ignorePatterns.length) return;
    requestPatchesInstalled = true;

    // Load the waiters first so that our wrappers sit outside of theirs.
    await requireAsync(["sap/ui/test/autowaiter/_XHRWaiter"]).catch(() => undefined);
    const fetchWaiter = await requireAsync(["sap/ui/test/autowaiter/_fetchWaiter"]).catch(() => undefined);

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (this: any, method: string, url: string | URL) {
      if (isIgnoredUrl(url)) this.ignored = true;
      // eslint-disable-next-line prefer-rest-params
      return (originalOpen as any).apply(this, arguments);
    } as typeof XMLHttpRequest.prototype.open;

    if (fetchWaiter) {
      const nativeFetch = w.__pwui5NativeFetch;
      if (typeof nativeFetch !== "function") {
        console.warn(
          "playwright-ui5: ignoreAutoWaitUrls only applies to XHR in this frame - the browser's fetch was not saved " +
            "(use the `ui5` fixture with the ignoreAutoWaitUrls option)"
        );
        return;
      }
      const waitingFetch = w.fetch;
      w.fetch = function (this: unknown, resource: any, options?: any) {
        const url = resource && typeof resource === "object" && "url" in resource ? resource.url : resource;
        return (isIgnoredUrl(url) ? nativeFetch : waitingFetch).call(window, resource, options);
      };
    }
  }

  function release(handleIds: string[]) {
    for (const h of handleIds) handles.delete(h);
  }

  // ---------------------------------------------------------------------------------------------
  // Fiori elements test library (sap.fe.test) on top of OPA5

  const fe = {
    configKey: undefined as string | undefined,
    log: [] as LogEntry[],

    async init(pages: Record<string, FEPageSpec>, opts: { timeout: number; configKey: string }) {
      await ready;
      if (fe.configKey === opts.configKey) return;
      const types = [...new Set(Object.values(pages).map((p) => p.type))];
      const [Opa5, Opa, ...classes] = await requireAsync([
        "sap/ui/test/Opa5",
        "sap/ui/test/Opa",
        ...types.map((t) => "sap/fe/test/" + t)
      ]);
      M.Opa5 = Opa5;
      M.Opa = Opa;
      const classByType: Record<string, any> = {};
      types.forEach((t, i) => (classByType[t] = classes[i]));

      const pageObjects: Record<string, unknown> = {};
      for (const [name, spec] of Object.entries(pages)) {
        const PageClass = classByType[spec.type];
        pageObjects[name] = spec.type === "Shell" ? new PageClass() : new PageClass(spec.definition);
      }
      Opa5.createPageObjects(pageObjects);
      Opa.extendConfig({
        timeout: Math.max(1, Math.ceil(opts.timeout / 1000)),
        pollingInterval: 200,
        autoWait: true
      });

      // Outside of QUnit there is no Opa5.assert; sap.fe.test reports every check through it.
      const push = (ok: unknown, message: unknown) =>
        fe.log.push({ ok: !!ok, message: message === undefined ? "" : String(message) });
      Opa5.assert = {
        ok: (v: unknown, m?: string) => push(v, m),
        notOk: (v: unknown, m?: string) => push(!v, m),
        equal: (a: unknown, b: unknown, m?: string) => push(a == b, m),
        notEqual: (a: unknown, b: unknown, m?: string) => push(a != b, m),
        strictEqual: (a: unknown, b: unknown, m?: string) => push(a === b, m),
        notStrictEqual: (a: unknown, b: unknown, m?: string) => push(a !== b, m),
        deepEqual: (a: unknown, b: unknown, m?: string) => push(JSON.stringify(a) === JSON.stringify(b), m),
        propEqual: (a: unknown, b: unknown, m?: string) => push(JSON.stringify(a) === JSON.stringify(b), m),
        expect: () => undefined,
        step: (m: string) => push(true, m)
      };
      fe.configKey = opts.configKey;
    },

    async run(kind: "given" | "when" | "then", steps: Array<{ p: string } | { a: unknown[] }>) {
      await ready;
      const Opa = M.Opa;
      if (!Opa || !fe.configKey) throw new Error("playwright-ui5: fe.init() has not been executed in this frame");
      fe.log = [];
      const root =
        kind === "given" ? Opa.config.arrangements : kind === "when" ? Opa.config.actions : Opa.config.assertions;

      let current: any = root;
      let thisArg: any = undefined;
      const path: string[] = [];
      for (const step of steps) {
        if ("p" in step) {
          path.push(step.p);
          thisArg = current;
          current = current == null ? undefined : current[step.p];
          if (current === undefined) {
            return { ok: false, error: `'${path.join(".")}' is not defined on ${kind}`, log: fe.log };
          }
        } else {
          if (typeof current !== "function") {
            return { ok: false, error: `'${path.join(".")}' is not a function`, log: fe.log };
          }
          try {
            current = current.apply(thisArg, deser(step.a));
          } catch (e) {
            Opa.stopQueue();
            return { ok: false, error: errMessage(e), log: fe.log };
          }
          thisArg = undefined;
        }
      }

      try {
        await new Promise<void>((resolve, reject) => {
          Opa.emptyQueue().done(resolve).fail(reject);
        });
      } catch (e) {
        try {
          Opa.stopQueue();
        } catch {
          // queue already stopped
        }
        return { ok: false, error: errMessage(e), log: fe.log };
      }
      const failed = fe.log.find((l) => !l.ok);
      if (failed) return { ok: false, error: failed.message, log: fe.log };
      return { ok: true, log: fe.log };
    }
  };

  w.__pwui5 = {
    bridgeVersion: BRIDGE_VERSION,
    ready,
    version: () => (sap.ui && sap.ui.version) || "unknown",
    waitForUI5,
    findControl,
    findControls,
    describeTarget,
    chain,
    navTo,
    configure,
    interact,
    release,
    ser,
    deser,
    resolveTarget,
    byId,
    fe
  };
})();
