---
"@ahangl/playwright-ui5": patch
---

Fiori elements `Given` / `When` statements wait until UI5 is idle after their last action. Before, a statement such as `When.onTheDetailPage.onFooter().iExecuteSave()` returned while the save was still running, so a following Playwright locator or read could run too early. Turn it off with `fe.init(pages, { waitAfter: false })` or `ui5Options.feWaitAfter: false`. `Then` statements don't wait afterwards.
