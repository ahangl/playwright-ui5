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
    "sap/ui/core/Core",
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
    const className =
      obj && typeof obj.getMetadata === "function" ? obj.getMetadata().getName() : undefined;
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

  function describe(control: any): ControlDescriptor {
    const dom = typeof control.getDomRef === "function" ? control.getDomRef() : null;
    return {
      id: control.getId(),
      className: control.getMetadata().getName(),
      domRefId: dom && dom.id ? dom.id : null,
      methods: methodsOf(control),
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
      if (!handles.has(target.h)) throw new Error(`playwright-ui5: object handle ${target.h} is no longer available (page reloaded?)`);
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

  /** Polls until a control matches (or the timeout is reached). Returns null if nothing matches. */
  async function findControl(selector: any, timeout: number): Promise<ControlDescriptor | null> {
    await ready;
    const deadline = Date.now() + timeout;
    const sel = deser(selector);
    let lastError: unknown;
    do {
      try {
        await M.RecordReplay.waitForUI5({ timeout: Math.max(deadline - Date.now(), 1000), interval: 100 });
        const el = await M.RecordReplay.findDOMElementByControlSelector({ selector: sel });
        const ctl = el && controlFromDom(el);
        if (ctl) return describe(ctl);
      } catch (e) {
        lastError = e;
      }
      await sleep(200);
    } while (Date.now() < deadline);
    if (lastError && !/no dom element found|could not find/i.test(errMessage(lastError))) {
      throw new Error(errMessage(lastError));
    }
    return null;
  }

  async function findControls(selector: any, timeout: number): Promise<ControlDescriptor[]> {
    await waitForUI5(timeout);
    const RR = M.RecordReplay;
    if (typeof RR.findAllDOMElementsByControlSelector !== "function") {
      throw new Error("playwright-ui5: findAll requires UI5 >= 1.80");
    }
    const els: Element[] = await RR.findAllDOMElementsByControlSelector({ selector: deser(selector) });
    const seen = new Set<string>();
    const out: ControlDescriptor[] = [];
    for (const el of els) {
      const ctl = controlFromDom(el);
      if (ctl && !seen.has(ctl.getId())) {
        seen.add(ctl.getId());
        out.push(describe(ctl));
      }
    }
    return out;
  }

  async function describeTarget(target: Target): Promise<ControlDescriptor> {
    await ready;
    return describe(resolveTarget(target));
  }

  async function call(target: Target, method: string, args: unknown[], timeout: number): Promise<Serialized> {
    await waitForUI5(timeout);
    const obj = resolveTarget(target);
    const fn = obj[method];
    if (typeof fn !== "function") {
      throw new Error(`playwright-ui5: '${method}' is not a function on ${obj?.getMetadata?.().getName?.() ?? "object"}`);
    }
    let result = fn.apply(obj, deser(args));
    if (result && typeof result.then === "function") result = await result;
    return ser(result);
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
      clearTextFirst,
    });
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
        ...types.map((t) => "sap/fe/test/" + t),
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
        autoWait: true,
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
        step: (m: string) => push(true, m),
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
    },
  };

  w.__pwui5 = {
    bridgeVersion: BRIDGE_VERSION,
    ready,
    version: () => (sap.ui && sap.ui.version) || "unknown",
    waitForUI5,
    findControl,
    findControls,
    describeTarget,
    call,
    interact,
    release,
    ser,
    deser,
    resolveTarget,
    byId,
    fe,
  };
})();
