import { test, expect } from "@ahangl/playwright-ui5";

const pages = {
  onTheAuthorPage: { ObjectPage: { appId: "fixture.books", componentId: "AuthorsObjectPage", contextPath: "/Authors" } }
} as const;

const hosts = [
  { name: "standalone", url: "/index.html" },
  { name: "iframe (Work Zone)", url: "/test/iframe.html" },
  { name: "FLP sandbox (embedded)", url: "/test/flpSandbox.html#Books-display" }
];

test.describe("Fiori elements object page in edit mode, field with a value list", () => {
  for (const host of hosts) {
    test(`iChangeField on a field with fixed values: ${host.name}`, async ({ ui5, fe }) => {
      await ui5.goTo(host.url);
      await ui5.goTo({
        route: "AuthorsObjectPage",
        params: { key: "ID=11111111-1111-4111-8111-111111111111,IsActiveEntity=true" }
      });
      const { When, Then } = fe.init(pages);
      await Then.onTheAuthorPage.iSeeThisPage();
      await When.onTheAuthorPage.onHeader().iExecuteEdit();
      await When.onTheAuthorPage.onForm("Author Details").iChangeField("Genre", "mystery");
      await Then.onTheAuthorPage.onForm("Author Details").iCheckField("Genre", "Mystery");
    });
  }
});

test("create mode: iChangeField on a field with fixed values", async ({ ui5, fe }) => {
  await ui5.goTo("/index.html");
  await ui5.goTo({ route: "AuthorsList" });
  const { When, Then } = fe.init({
    ...pages,
    onTheAuthorsList: { ListReport: { appId: "fixture.books", componentId: "AuthorsList", contextPath: "/Authors" } }
  });
  await When.onTheAuthorsList.onTable().iExecuteCreate();
  await Then.onTheAuthorPage.iSeeThisPage();
  await When.onTheAuthorPage.onForm("Author Details").iChangeField("Genre", "mystery");
  await Then.onTheAuthorPage.onForm("Author Details").iCheckField("Genre", "Mystery");
});

test("workaround: control API enterText on the mdc field, then Tab", async ({ ui5, fe }) => {
  await ui5.goTo("/index.html");
  await ui5.goTo({
    route: "AuthorsObjectPage",
    params: { key: "ID=11111111-1111-4111-8111-111111111111,IsActiveEntity=true" }
  });
  const { When, Then } = fe.init(pages);
  await When.onTheAuthorPage.onHeader().iExecuteEdit();

  // The form label is not "labelFor" the mdc field itself, so select it by the end of its stable id.
  const genre = { controlType: "sap.ui.mdc.Field", id: /::FormElement::DataField::genre_code::Field-edit$/ };
  await ui5.control(genre).enterText("mystery");
  await (await ui5.locator({ ...genre, interaction: "focus" })).press("Tab");
  await ui5.waitForUI5();

  await expect(ui5.control(genre)).toHaveUI5Property("value", "mystery");
  await Then.onTheAuthorPage.onForm("Author Details").iCheckField("Genre", "Mystery");
});
