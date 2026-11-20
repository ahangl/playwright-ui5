import { test, expect } from "@ahangl/playwright-ui5";
import type { Page } from "@playwright/test";
import type Button from "sap/m/Button";

const pages = {
  onTheMainPage: { ListReport: { appId: "fixture.books", componentId: "BooksList", contextPath: "/Books" } },
} as const;
const GO_BUTTON = { controlType: "sap.m.Button", properties: { text: "Go" } };

/** Delays UI5 bootstrapping inside iframes, so the app iframe exists long before UI5 runs in it. */
async function slowUI5InIframes(page: Page, delayMs: number) {
  await page.route("https://ui5.sap.com/**/sap-ui-core.js", async (route) => {
    const frame = route.request().frame();
    if (frame.parentFrame()) await new Promise((r) => setTimeout(r, delayMs));
    await route.continue();
  });
}

test.describe("launchpad with apps in an iframe (like SAP Build Work Zone)", () => {
  test("finds the app iframe even when UI5 loads in it after the shell is idle", async ({ page, ui5, fe }) => {
    await slowUI5InIframes(page, 2_500);
    await ui5.goTo("/test/launchpadHost.html#Books-display");

    const frame = await ui5.appFrame();
    expect(frame).not.toBe(page.mainFrame());
    expect(frame.url()).toContain("/index.html");

    const { Then } = fe.init(pages);
    await Then.onTheMainPage.iSeeThisPage();
    await Then.onTheMainPage.onTable().iCheckRows({}, 5);
  });

  test("re-detects the app frame when the app iframe appears after the home page", async ({ page, ui5 }) => {
    await ui5.goTo("/test/launchpadHost.html");
    await ui5.waitForUI5(); // launchpad home -> main frame
    expect(await ui5.appFrame()).toBe(page.mainFrame());

    await page.evaluate(() => (location.hash = "#Books-display"));
    const go = await ui5.control(GO_BUTTON);
    expect(go.frame).not.toBe(page.mainFrame());
    expect((await ui5.appFrame()).url()).toContain("/index.html");
  });
});

test.describe("controls in the launchpad shell", () => {
  const USER_BUTTON = { controlType: "sap.m.Button", properties: { text: "User" } };

  test("ui5.shell finds controls in the top-level frame, ui5 in the app frame", async ({ page, ui5 }) => {
    await ui5.goTo("/test/launchpadHost.html#Books-display");
    const go = await ui5.control(GO_BUTTON);
    expect(go.frame).not.toBe(page.mainFrame());

    expect(await ui5.shell.control<Button>(USER_BUTTON).getText()).toBe("User");
    await expect(ui5.shell.control(USER_BUTTON)).toBeUI5Visible();
    expect(await ui5.shell.controlOrNull(GO_BUTTON, { timeout: 500 })).toBeNull();
    expect(await ui5.controlOrNull(USER_BUTTON, { timeout: 500 })).toBeNull();
  });
});

test.describe("navigating back to the launchpad home", () => {
  test("switches back to the launchpad frame", async ({ page, ui5 }) => {
    await ui5.goTo("/test/launchpadHost.html#Books-display");
    const go = await ui5.control(GO_BUTTON);
    expect(go.frame).not.toBe(page.mainFrame());

    await ui5.goTo("#Shell-home");
    await expect.poll(async () => (await ui5.appFrame()) === ui5.shellFrame()).toBe(true);
  });
});

test.describe("launchpad with embedded apps (ushell sandbox)", () => {
  test("launchpad home resolves to the main frame without waiting for an app", async ({ page, ui5 }) => {
    await ui5.goTo("/test/flpSandbox.html");
    const started = Date.now();
    await ui5.waitForUI5();
    expect(await ui5.appFrame()).toBe(page.mainFrame());
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  test("runs Fiori elements statements in the launchpad window", async ({ page, ui5, fe }) => {
    await ui5.goTo("/test/flpSandbox.html#Books-display");
    const { Then } = fe.init(pages);
    await Then.onTheMainPage.iSeeThisPage();
    await Then.onTheMainPage.onTable().iCheckRows({}, 5);
    expect(await ui5.appFrame()).toBe(page.mainFrame());
  });
});
