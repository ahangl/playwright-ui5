/* eslint-disable @typescript-eslint/no-explicit-any -- UI5 controls inside exec() callbacks are untyped. */
import { test, expect } from "@ahangl/playwright-ui5";

const pages = {
  onTheMainPage: { ListReport: { appId: "fixture.books", componentId: "BooksList", contextPath: "/Books" } },
  onTheDetailPage: { ObjectPage: { appId: "fixture.books", componentId: "BooksObjectPage", contextPath: "/Books" } }
} as const;

test.describe("Fiori elements test library", () => {
  test("list report: filter, check rows, navigate to object page", async ({ ui5, fe }) => {
    await ui5.goTo("/index.html");
    const { When, Then } = fe.init(pages);

    await Then.onTheMainPage.iSeeThisPage();
    await Then.onTheMainPage.onTable().iCheckRows({}, 5);

    await When.onTheMainPage.onFilterBar().iChangeFilterField("Author", "Edgar Allan Poe").and.iExecuteSearch();
    await Then.onTheMainPage.onTable().iCheckRows({}, 2);
    await Then.onTheMainPage.onTable().iCheckRows({ "Book ID": "251" }, 1);

    await When.onTheMainPage.onTable().iPressRow({ "Book ID": "251" });
    await Then.onTheDetailPage.iSeeThisPage();
    await Then.onTheDetailPage.onHeader().iCheckTitle("The Raven");
    await Then.onTheDetailPage.onForm({ section: "General" }).iCheckField({ property: "stock" }, "333");
    expect(ui5.page.url()).toContain("#/Books(251)");
  });

  test("mixing fe statements with the control API", async ({ ui5, fe }) => {
    await ui5.goTo("/index.html");
    const { When, Then } = fe.init(pages);
    await When.onTheMainPage.onFilterBar().iChangeSearchField("Raven").and.iExecuteSearch();
    await Then.onTheMainPage.onTable().iCheckRows({}, 1);
    expect(await ui5.controls({ controlType: "sap.m.ColumnListItem" })).toHaveLength(1);
  });

  test("reports the OPA error and the failing statement", async ({ ui5, fe }) => {
    await ui5.goTo("/index.html");
    const { Then } = fe.init(pages, { timeout: 3_000 });
    const error = await Promise.resolve(Then.onTheMainPage.onTable().iCheckRows({}, 99)).then(
      () => undefined,
      (e: Error) => e
    );
    expect(error?.message).toContain("Then onTheMainPage.onTable().iCheckRows({}, 99) failed");
    expect(error?.stack).toContain("fe.spec.ts");

    // the OPA queue is usable again after a failure
    await Then.onTheMainPage.onTable().iCheckRows({}, 5);
  });

  test("exceptions inside sap.fe.test are reported without browser stack frames", async ({ ui5, fe }) => {
    // Like an app in live mode: the filter bar has no Go button, so iExecuteSearch() throws in OPA.
    await ui5.goTo("/index.html");
    const go = await ui5.control({ controlType: "sap.m.Button", properties: { text: "Go" } });
    await go.exec((control: any) => control.setVisible(false));

    const { When } = fe.init(pages, { timeout: 3_000 });
    const error = await Promise.resolve(When.onTheMainPage.onFilterBar().iExecuteSearch()).then(
      () => undefined,
      (e: Error) => e
    );
    expect(error?.message).toContain("no element with user-provided ID suffix 'btnSearch'");
    expect(error?.message).not.toMatch(/^\s*at\s/m);
    const firstFrame = error?.stack?.split("\n").find((l) => /^\s+at\s/.test(l));
    expect(firstFrame).toContain("fe.spec.ts");
  });

  test("unknown page names fail fast", async ({ fe }) => {
    const { When } = fe.init(pages);
    expect(() => (When as any).onTheWrongPage).toThrow(/unknown page 'onTheWrongPage'/);
  });

  test("runs inside the application iframe", async ({ ui5, fe, page }) => {
    await page.goto("/test/iframe.html");
    const { When, Then } = fe.init(pages);
    await When.onTheMainPage.onFilterBar().iChangeFilterField("Author", "Emily Brontë").and.iExecuteSearch();
    await Then.onTheMainPage.onTable().iCheckRows({}, 1);
    await When.onTheMainPage.onTable().iPressRow({ "Book ID": "201" });
    await Then.onTheDetailPage.onHeader().iCheckTitle("Wuthering Heights");
    expect((await ui5.appFrame()).url()).toContain("#/Books(201)");
  });
});
