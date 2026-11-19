import { test, expect } from "@ahangl/playwright-ui5";

/**
 * Smoke tests against a real SAP Build Work Zone site (opt-in). Environment:
 * - WORKZONE_URL            site URL, e.g. https://<subdomain>.launchpad.cfapps.eu10.hana.ondemand.com/site/<site>
 * - UI5_USERNAME/UI5_PASSWORD  test user (no MFA)
 * - WORKZONE_IDP            optional IdP to pick on the XSUAA selection page
 * - WORKZONE_APP_INTENT     optional, e.g. "#Books-manage" - an SAP Fiori elements V4 List Report app
 * - WORKZONE_APP_ID / WORKZONE_LR_COMPONENT / WORKZONE_CONTEXT_PATH   optional, enables the FE check
 */
test.skip(!process.env.WORKZONE_URL, "WORKZONE_URL is not set");

test("the stored session opens the launchpad", async ({ page, ui5 }) => {
  await page.goto(process.env.WORKZONE_URL!);
  await ui5.waitForUI5();
  expect(new URL(page.url()).origin).toBe(new URL(process.env.WORKZONE_URL!).origin);
});

test("opens an app via intent and runs FE assertions inside the app frame", async ({ ui5, fe }) => {
  const intent = process.env.WORKZONE_APP_INTENT;
  test.skip(!intent, "WORKZONE_APP_INTENT is not set");

  await ui5.goTo(intent!);
  const frame = await ui5.appFrame();
  test.info().annotations.push({ type: "app frame", description: frame === ui5.shellFrame() ? "main frame" : frame.url() });

  const appId = process.env.WORKZONE_APP_ID;
  const componentId = process.env.WORKZONE_LR_COMPONENT;
  test.skip(!appId || !componentId, "WORKZONE_APP_ID / WORKZONE_LR_COMPONENT not set");

  const { Then } = fe.init({
    onTheMainPage: { ListReport: { appId: appId!, componentId: componentId!, contextPath: process.env.WORKZONE_CONTEXT_PATH } },
  });
  // Only checks every FE V4 List Report satisfies. (No iExecuteSearch(): apps in live mode have no Go button.)
  await Then.onTheMainPage.iSeeThisPage();
  await Then.onTheMainPage.onTable().iCheckState({ visible: true });

  // Back to the launchpad home. Not via sap.fe.test's Shell.iNavigateHome(): it clicks the classic
  // header logo (#shell-header-logo), which the Work Zone shell bar doesn't have.
  await ui5.goTo("#Shell-home");
  await expect.poll(async () => (await ui5.appFrame()) === ui5.shellFrame()).toBe(true);
});
