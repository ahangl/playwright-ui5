import { test, expect, type UI5 } from "@ahangl/playwright-ui5";
import type { APIRequestContext, Page } from "@playwright/test";
import { discardAuthorDraft } from "./fixture-data";

const pages = {
  onTheAuthorPage: { ObjectPage: { appId: "fixture.books", componentId: "AuthorsObjectPage", contextPath: "/Authors" } }
} as const;

/** The name as the object page shows it in display mode; empty while the page is in edit mode. */
const displayedName = (page: Page) =>
  page.locator('[id$="::FormElement::DataField::name::Field-display"]').allInnerTexts();

/** Delays the draft activation (the Save request), so a statement that returns too early would show. */
async function slowSave(page: Page) {
  const state = { activated: false };
  await page.route("**/odata/v4/catalog/$batch", async (route) => {
    if (!route.request().postData()?.includes("draftActivate")) return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await route.continue();
    state.activated = true;
  });
  return state;
}

async function openAuthor(ui5: UI5, request: APIRequestContext, id: string) {
  await discardAuthorDraft(request, id);
  await ui5.goTo("/index.html");
  await ui5.goTo({ route: "AuthorsObjectPage", params: { key: `ID=${id},IsActiveEntity=true` } });
}

test("a When statement waits until UI5 is idle after its last action (Save)", async ({ page, ui5, fe, request }) => {
  await openAuthor(ui5, request, "22222222-2222-4222-8222-222222222222");
  const { When } = fe.init(pages);
  await When.onTheAuthorPage.onHeader().iExecuteEdit();
  const name = `Mary Shelley ${Date.now()}`;
  await When.onTheAuthorPage.onForm("Author Details").iChangeField("Name", name);
  const save = await slowSave(page);

  await When.onTheAuthorPage.onFooter().iExecuteSave();

  // No wait and no retrying assertion: the saved value must be there at once.
  expect(save.activated).toBe(true);
  expect(await displayedName(page)).toEqual([name]);
  expect(page.url()).toContain("IsActiveEntity=true");
});

test("waitAfter: false returns right after the last action", async ({ page, ui5, fe, request }) => {
  await openAuthor(ui5, request, "33333333-3333-4333-8333-333333333333");
  const { When } = fe.init(pages, { waitAfter: false });
  await When.onTheAuthorPage.onHeader().iExecuteEdit();
  await ui5.waitForUI5();
  const name = `Jane Austen ${Date.now()}`;
  await When.onTheAuthorPage.onForm("Author Details").iChangeField("Name", name);
  await ui5.waitForUI5();
  const save = await slowSave(page);

  await When.onTheAuthorPage.onFooter().iExecuteSave();

  expect(save.activated).toBe(false);
  await ui5.waitForUI5();
  expect(save.activated).toBe(true);
  expect(await displayedName(page)).toEqual([name]);
});
