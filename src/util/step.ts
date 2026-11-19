import { test, type Location } from "@playwright/test";

/** Parses a V8 stack frame line: `at fn (file:1:2)`, `at file:1:2`, `at async fn (file:1:2)`. */
function parseFrame(line: string): Location | undefined {
  let s = line.trim();
  if (!s.startsWith("at ")) return undefined;
  s = s.slice(3);
  const inParens = /\(([^()]*)\)\s*$/.exec(s);
  s = inParens ? inParens[1] : s.replace(/^async /, "");
  const m = /^(.*):(\d+):(\d+)$/.exec(s);
  if (!m) return undefined;
  return { file: m[1].replace(/^file:\/\//, ""), line: Number(m[2]), column: Number(m[3]) };
}

/**
 * Root directory of this package. Stack frames may point to the bundle (dist/) or - when source
 * maps are applied, as Playwright does - to the original sources (src/).
 */
const OWN_ROOT = (() => {
  const file = parseFrame(new Error().stack?.split("\n")[1] ?? "")?.file;
  const m = file && /^(.*[\\/])(?:dist|src)[\\/]/.exec(file);
  return m ? m[1] : undefined;
})();

function isLibraryFrame(file: string): boolean {
  if (file.startsWith("node:") || file.includes("/node_modules/") || file.includes("\\node_modules\\")) return true;
  if (!OWN_ROOT || !file.startsWith(OWN_ROOT)) return false;
  return /^(?:dist|src)[\\/]/.test(file.slice(OWN_ROOT.length));
}

/** First stack frame that belongs to user code (not this library, node internals or node_modules). */
export function callerLocation(error: Error = new Error()): Location | undefined {
  for (const line of (error.stack ?? "").split("\n").slice(1)) {
    const loc = parseFrame(line);
    if (loc && !isLibraryFrame(loc.file)) return loc;
  }
  return undefined;
}

/**
 * Removes this library's frames from an error's stack so that Playwright shows the user's
 * source line in the report. Returns the same error.
 */
export function cleanStack<E>(error: E): E {
  if (!(error instanceof Error) || !error.stack) return error;
  const lines = error.stack.split("\n");
  const firstFrame = lines.findIndex((l) => /^\s+at /.test(l));
  if (firstFrame < 0) return error;
  const frames = lines.slice(firstFrame).filter((l) => {
    const loc = parseFrame(l);
    return !loc || !isLibraryFrame(loc.file);
  });
  error.stack = [...lines.slice(0, firstFrame), ...frames].join("\n");
  return error;
}

/**
 * Runs `body` as a Playwright test step attributed to the caller's source line (so it shows
 * up nicely in reports and traces and errors point at the test code), or plainly when called
 * outside of a running test (e.g. in a global setup).
 */
export async function step<T>(title: string, body: () => Promise<T>, site?: Error): Promise<T> {
  let insideTest = true;
  try {
    test.info();
  } catch {
    insideTest = false;
  }
  if (!insideTest) return body();
  // Not `box: true`: Playwright would replace error stacks with the stack at this call, which is
  // inside this library. Instead the step gets the caller's location and our errors carry cleaned
  // stacks (see cleanStack) that point at the user's code.
  const location = callerLocation(site ?? new Error());
  return test.step(title, body, location ? { location } : {});
}

export function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof RegExp) return String(a);
      if (typeof a === "function") return "fn";
      try {
        const s = JSON.stringify(a);
        return s === undefined ? String(a) : s.length > 80 ? s.slice(0, 77) + "..." : s;
      } catch {
        return String(a);
      }
    })
    .join(", ");
}
