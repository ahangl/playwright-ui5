# @ahangl/playwright-ui5

## 1.0.0

### Major Changes

- 7b92a5a: First release. UI5-aware end-to-end testing for Playwright:
  
  - The `ui5` fixture finds UI5 controls with wdi5/OPA selectors, calls their methods (also as a chain with a single `await`), presses and enters text with OPA's actions, and waits until UI5 is idle before each call. It detects the app frame in a launchpad or SAP Build Work Zone.
  - `expect` adds retrying UI5 matchers, such as `toHaveUI5Text()` and `toHaveUI5Count()`.
  - The `fe` fixture runs SAP's Fiori elements V4 test library (`sap.fe.test`) with typed `Given` / `When` / `Then` statements.
  - `login()` and `ias()` log in to SAP Build Work Zone with SAP IAS once and save the session for Playwright's `storageState`.
  
  Documentation: https://ahangl.github.io/playwright-ui5/
