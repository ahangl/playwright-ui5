import { test, expect } from "@ahangl/playwright-ui5";

// Type test only (npm run typecheck). It is not a Playwright test file and never runs.
test("a consumer without @sapui5/types", async ({ ui5, fe }) => {
  const { When, Then } = fe.init({
    onTheMainPage: { ListReport: { appId: "my.app", componentId: "BooksList", contextPath: "/Books" } }
  });
  await When.onTheMainPage.onFilterBar().iChangeSearchField("Poe").and.iExecuteSearch();
  await Then.onTheMainPage.onTable().iCheckRows({}, 2);
  // Without @sapui5/types the chains are untyped, so any method name compiles.
  await When.onTheMainPage.aMethodThatSapFeTestDoesNotHave();

  await ui5.control({ controlType: "sap.m.Button", properties: { text: "Go" } }).press();
  await expect(ui5.control({ controlType: "sap.m.Button" })).toBeUI5Enabled();
});
