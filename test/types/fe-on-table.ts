import { test } from "@ahangl/playwright-ui5";

// Type test only (npm run typecheck), compiled with and without @sapui5/types (test/types/with-sapui5 and
// test/types/without-sapui5). It is not a Playwright test file and never runs.
test("onTable() takes an optional table identifier", async ({ fe }) => {
  const { When, Then } = fe.init({
    onTheMainPage: { ListReport: { appId: "my.app", componentId: "BooksList", contextPath: "/Books" } },
    onTheDetailPage: { ObjectPage: { appId: "my.app", componentId: "BooksObjectPage", contextPath: "/Books" } }
  });

  // No argument: the page's only table. SAP's typings before 1.150 require the argument.
  await When.onTheMainPage.onTable().iPressRow({ "Book ID": "251" });
  await Then.onTheMainPage.onTable().iCheckRows({}, 2);
  await When.onTheDetailPage.onTable().iExecuteCreate();
  await Then.onTheDetailPage.onTable().iCheckRows({}, 1);

  // Header title or identifier object.
  await When.onTheDetailPage.onTable("Reviews").iExecuteCreate();
  await Then.onTheDetailPage.onTable({ property: "reviews", qualifier: "recent" }).iCheckRows({}, 1);

  // An empty object is not a table identifier: it builds the table id fe::table::undefined::LineItem.
  // @ts-expect-error -- `property` is missing
  await When.onTheMainPage.onTable({}).iPressRow({ "Book ID": "251" });
  // @ts-expect-error -- `property` is missing
  await Then.onTheDetailPage.onTable({}).iCheckRows({}, 1);
});
