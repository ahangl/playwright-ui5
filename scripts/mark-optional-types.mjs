/*
 * Runs after `tsup`. The declaration bundler drops comments on imports, so this step puts
 * `// @ts-ignore` back above the imports of `sap/*` modules in dist/index.d.ts and dist/index.d.mts.
 *
 * `@sapui5/types` is an optional peer dependency. Without it, the `sap/*` modules do not exist, and a
 * consumer with `skipLibCheck: false` would get TS2307. With the comment the import becomes `any`, so the
 * Fiori elements chains are untyped. With `@sapui5/types` installed, the comment has no effect.
 * Playwright uses the same pattern for its optional peer `zod` (playwright-core/types/types.d.ts).
 */
import { readFileSync, writeFileSync } from "node:fs";

const COMMENT = "// @ts-ignore: optional peer dependency @sapui5/types (the chains are untyped without it)";
const SAP_IMPORT = /^import .* from ['"]sap\/[^'"]+['"];?$/;

for (const file of ["dist/index.d.ts", "dist/index.d.mts"]) {
  const lines = readFileSync(file, "utf8").split("\n");
  let marked = 0;
  const out = [];
  lines.forEach((line, i) => {
    if (SAP_IMPORT.test(line)) {
      if (lines[i - 1] !== COMMENT) out.push(COMMENT);
      marked++;
    }
    out.push(line);
  });
  if (marked === 0) {
    throw new Error(`${file}: no import of a sap/* module found. Check scripts/mark-optional-types.mjs.`);
  }
  writeFileSync(file, out.join("\n"));
  console.log(`${file}: marked ${marked} sap/* imports as optional`);
}
