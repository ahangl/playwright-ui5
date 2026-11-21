# Documentation style for playwright-ui5

This file adds project decisions to the [Google developer documentation style guide](https://developers.google.com/style). Where the two conflict, this file wins. VitePress doesn't publish it.

## Terms

Use these terms the same way on every page.

| Use                                                         | Don't use                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| playwright-ui5 (prose), `@ahangl/playwright-ui5` (import)   | the helper, the library (when you mean this one)                          |
| Fiori elements, Fiori elements V2, Fiori elements V4        | Fiori Elements, FE                                                        |
| SAP Build Work Zone (first mention), Work Zone              | SAP Launchpad service, BTP Work Zone, WZ                                  |
| SAP Fiori launchpad (first mention), launchpad, FLP sandbox | launchpad for Work Zone, Launchpad (mid-sentence), launchpad sandbox page |
| app frame (the concept), app iframe (the HTML element)      | application iframe, app window                                            |
| control API                                                 | Control API, UI5 API                                                      |
| `RemoteControl`, remote object                              | handle, proxy                                                             |
| statement (`When.onTheMainPage...`), page object            | step (for a statement), page model                                        |
| list report, object page (prose); `ListReport` (code)       | List Report, Object Page                                                  |
| UI5 is idle                                                 | UI5 is ready, UI5 is stable, UI5 is not busy                              |
| OPA, wdi5, UI5, SAPUI5, OpenUI5                             | Opa, WDI5, ui5 (except the `ui5` fixture)                                 |

"Launchpad" means only the SAP Fiori launchpad: on-premise systems and the FLP sandbox. SAP Build Work Zone was called SAP Launchpad service before, so don't call it a launchpad. When something applies to both, write "launchpad or Work Zone".

## Examples

- Use the bookshop domain: `Books`, `Authors`, `Reviews`, and `Genres`, with `appId: "my.books"` and authors such as Edgar Allan Poe. Never copy names, ids, or data from a customer project.
- Keep snippets minimal and correct. Check signatures and option names against `src/`, and claims about `sap.fe.test` against its sources.
- Omit `import` lines and the `test(...)` wrapper unless the snippet needs them. Add `import type` lines for UI5 classes used as type parameters.

## Formatting

- Code blocks: `ts` for code, `bash` for commands, `json` and `css` for those files, `txt` for output and error messages, `js` only for JavaScript config files.
- Quote error messages exactly as the code produces them, in code font.
- Containers: use `::: warning` only for a requirement the reader can't miss. Don't use `::: tip` or `::: info` for content that fits in a sentence.
- Every page has frontmatter with a quoted `description` of one sentence. `llms.txt` lists it.
- Reference pages may use API names as headings without code font, for example `### ui5.control()`, so that the anchors stay short.

## Page types

Start new pages from a template in [`_templates/`](./_templates/):

- `guide.md`: explains a concept or a task, links to the reference for details.
- `reference.md`: one H3 per member with a signature, a short description, and an example.
- `troubleshooting-entry.md`: one problem with **Symptom**, **Cause**, and **Fix**.

## Versions

Only mention versions that the package supports: Node.js 22, Playwright 1.60 or later, `@sapui5/types` 1.120 or later. State the UI5 version when a behavior depends on it.
