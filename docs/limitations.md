---
description: "What playwright-ui5 doesn't support yet, and the workarounds."
---

# Known limitations

- **Fiori elements V2** (`sap.suite.ui.generic.template`) is not supported yet. The control API works with any UI5 app.
- **`sap.fe.test` `Shell` actions don't work with the SAP Build Work Zone shell bar.** `iNavigateHome()` clicks `#shell-header-logo` and `iNavigateBack()` looks for the control `backBtn`, both parts of the classic launchpad header. The Work Zone shell bar has neither, so both fail.
  - In Work Zone, navigate with `ui5.goTo("#Shell-home")` or `ui5.goTo("#Intent-action")` instead.
  - `Shell` page objects still work with the classic header (FLP sandbox, on-premise launchpad).
- **List reports with several table views** (tabs with different entity sets) can't be addressed with one `ListReport` page config. Use the control API for the other tabs, see [Cookbook](./cookbook#list-report-with-several-table-views).
- **Custom page extensions:** `fe.init` creates the `sap.fe.test` page objects from the page configuration only. Own actions and assertions added to a page object (OPA's additional page definitions) aren't supported. Use the control API for them.
- **MFA** is not supported by the login providers. Use a technical test user without MFA.
- **Functions can't be arguments** of control methods. Use `exec`, see [Cookbook](./cookbook#mock-event-parameters).
- **`ignoreAutoWaitUrls` for `fetch`** needs the `ui5` fixture. With `new UI5(page, options)` only XHR requests are ignored.
