import { test, expect, type UI5 } from "@ahangl/playwright-ui5";
import type { Page } from "@playwright/test";

const GO_BUTTON = { controlType: "sap.m.Button", properties: { text: "Go" } };

/** Opens one XHR and one fetch request in the app that never get an answer (like long polling). */
async function startLongPolling(page: Page, ui5: UI5) {
  await page.route("**/longpoll*", () => {
    // never fulfilled
  });
  // the short waitForUI5Timeout of these tests is for the call under test, not for loading the app
  await ui5.goTo("/index.html", { timeout: 15_000 });
  await ui5.exec(() => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "longpoll?xhr");
    xhr.send();
    void fetch("longpoll?fetch").catch(() => undefined);
  });
}

test.describe("requests that never finish", () => {
  test.use({ ui5Options: { waitForUI5Timeout: 2_000 } });

  test("block waiting for UI5 by default", async ({ page, ui5 }) => {
    await startLongPolling(page, ui5);
    await expect(ui5.control(GO_BUTTON).getText()).rejects.toThrow(/longpoll/);
  });
});

test.describe("ignoreAutoWaitUrls", () => {
  test.use({ ui5Options: { waitForUI5Timeout: 2_000, ignoreAutoWaitUrls: [/longpoll/] } });

  test("ignored XHR and fetch requests are not waited for", async ({ page, ui5 }) => {
    await startLongPolling(page, ui5);
    // would fail after 2 s if the pending requests were waited for
    expect(await ui5.control(GO_BUTTON).getText()).toBe("Go");
  });
});

test.describe("ignoreAutoWaitUrls with string patterns", () => {
  test.use({ ui5Options: { waitForUI5Timeout: 2_000, ignoreAutoWaitUrls: ["longpoll\\?(xhr|fetch)"] } });

  test("strings are regular expression sources", async ({ page, ui5 }) => {
    await startLongPolling(page, ui5);
    expect(await ui5.control(GO_BUTTON).getText()).toBe("Go");
  });
});
