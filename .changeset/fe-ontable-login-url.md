---
"@ahangl/playwright-ui5": patch
---

- `onTable()` of the Fiori elements chains takes an optional table identifier, also with `@sapui5/types` before 1.150 (which declares it as required). Without an argument the page's only table is used. An empty object (`onTable({})`, which builds the table id `fe::table::undefined::LineItem`) is now a type error, also without `@sapui5/types`.
- `login()` rejects a relative `url` with a clear message (`login() needs an absolute url, got "..."; build it with new URL(path, baseURL).href`) instead of `TypeError: Invalid URL`.
