# Known limitations

- **Fiori elements V2** (`sap.suite.ui.generic.template`) is not supported yet. The control API works with any UI5 app.
- **`sap.fe.test` `Shell` actions don't work with the SAP Build Work Zone shell bar.** `iNavigateHome()` (and probably `iNavigateBack()`) rely on DOM ids of the classic launchpad header: it clicks `#shell-header-logo`, and the back action looks for `backBtn`. The Work Zone shell bar doesn't have these elements.
  - In Work Zone, navigate with `ui5.goTo("#Shell-home")` or `ui5.goTo("#Intent-action")` instead.
  - `Shell` page objects still work with the classic header (FLP sandbox, on-premise launchpad).
- **List reports with several table views** (tabs with different entity sets) can't be addressed with one `ListReport` page config. Use the control API for the other tabs, see [Recipes](./recipes#list-report-with-several-table-views).
- **MFA** is not supported by the login providers. Use a technical test user without MFA.
- **Functions can't be arguments** of control methods. Use `exec`, see [Recipes](./recipes#mock-event-parameters).
- **`ignoreAutoWaitUrls` for `fetch`** needs the `ui5` fixture. With `new UI5(page, options)` only XHR requests are ignored.
