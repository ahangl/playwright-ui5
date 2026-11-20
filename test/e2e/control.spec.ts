import { test, expect, type RemoteControl } from "@ahangl/playwright-ui5";
import type Button from "sap/m/Button";

const GO_BUTTON = { controlType: "sap.m.Button", properties: { text: "Go" } };
const AUTHOR_FILTER = { controlType: "sap.ui.mdc.FilterField", properties: { label: "Author" } };
const ROW = { controlType: "sap.m.ColumnListItem" };

test.describe("control API (standalone app)", () => {
  test.beforeEach(async ({ ui5 }) => {
    await ui5.goTo("/index.html");
  });

  test("waits for UI5 and reports the version", async ({ ui5 }) => {
    expect(await ui5.version()).toMatch(/^1\.\d+\.\d+/);
  });

  test("finds a control and calls typed methods", async ({ ui5 }) => {
    const go = await ui5.control<Button>(GO_BUTTON);
    expect(go.className).toBe("sap.m.Button");
    expect(await go.getText()).toBe("Go");
    expect(await go.getEnabled()).toBe(true);
    expect(await go.getProperty("type")).toBeTruthy();
  });

  test("supports RegExp in selectors", async ({ ui5 }) => {
    const go = await ui5.control({ controlType: "sap.m.Button", properties: { text: /^g/i } });
    expect(await go.getText()).toBe("Go");
  });

  test("supports the declarative RegExp notation of wdi5/OPA", async ({ ui5 }) => {
    const selector = { controlType: "sap.m.Button", properties: { text: { regex: { source: "^g", flags: "i" } } } };
    expect(await ui5.control(selector, { timeout: 3_000 }).getText()).toBe("Go");
  });

  test("exposes a native Playwright locator", async ({ ui5 }) => {
    const go = await ui5.locator(GO_BUTTON);
    await expect(go).toBeVisible();
    await expect(go).toHaveText("Go");
  });

  test("enters text and presses buttons like OPA", async ({ ui5 }) => {
    expect(await ui5.controls(ROW)).toHaveLength(5);
    await ui5.enterText(AUTHOR_FILTER, "Edgar Allan Poe");
    await ui5.press(GO_BUTTON);
    await expect(ui5.controls(ROW)).toHaveUI5Count(2);
  });

  test("returns aggregations as remote controls and objects as handles", async ({ ui5 }) => {
    const rows = await ui5.controls(ROW);
    const first = rows[0];
    expect(await first.getBindingContextPath()).toBe("/Books(201)");

    const cells = (await first.getCells()) as RemoteControl[];
    expect(cells.length).toBeGreaterThan(2);

    const context = await first.getBindingContext();
    expect(context.className).toMatch(/Context/);
    expect(await context.getProperty("title")).toBe("Wuthering Heights");
  });

  test("runs functions in the browser", async ({ ui5 }) => {
    const version = await ui5.exec(() => (window as any).sap.ui.version as string);
    expect(version).toMatch(/^1\./);

    const go = await ui5.control(GO_BUTTON);
    const info = await go.exec((control: any, suffix: string) => control.getText() + suffix, "!");
    expect(info).toBe("Go!");

    const sameButton = await ui5.exec((id: string) => (window as any).__pwui5.byId(id), go.id);
    expect((sameButton as RemoteControl).id).toBe(go.id);
  });

  test("passes remote controls as arguments", async ({ ui5 }) => {
    const go = await ui5.control(GO_BUTTON);
    const parent = await go.getParent();
    const aggregation = await go.exec((control: any) => control.sParentAggregationName as string);
    // the remote control is resolved to the very same UI5 object in the browser (-1 otherwise)
    expect(await parent.indexOfAggregation(aggregation, go)).toBeGreaterThanOrEqual(0);
  });

  test("waits for controls to become interactable before pressing", async ({ ui5 }) => {
    const go = await ui5.control(GO_BUTTON, { timeout: 2_000 });
    await go.exec((control: any) => control.setEnabled(false));
    await expect(go.press()).rejects.toThrow(/is not interactable .*enabled=false/);

    // re-enabled shortly after -> press waits and succeeds
    await go.exec((control: any) => setTimeout(() => control.setEnabled(true), 500));
    await go.press();
  });

  test("interaction selects the inner DOM element for the locator", async ({ ui5 }) => {
    const root = await ui5.locator(AUTHOR_FILTER);
    expect(await root.evaluate((el) => el.tagName)).not.toBe("INPUT");
    const input = await ui5.locator({ ...AUTHOR_FILTER, interaction: "focus" });
    expect(await input.evaluate((el) => el.tagName)).toBe("INPUT");
    await input.fill("Edgar Allan Poe");
    expect(await ui5.control(AUTHOR_FILTER).getConditions()).toHaveLength(0); // not yet submitted
  });

  test("a missing interaction element fails right away with a clear message", async ({ ui5 }) => {
    const started = Date.now();
    await expect(
      ui5.locator({ ...AUTHOR_FILTER, interaction: { idSuffix: "doesNotExist" } }, { timeout: 5_000 })
    ).rejects.toThrow(/sap\.ui\.mdc\.FilterField#.* has no '\{"idSuffix":"doesNotExist"\}' element/);
    expect(Date.now() - started).toBeLessThan(4_000);
  });

  test("navigates with the app's router", async ({ ui5, page }) => {
    await ui5.goTo({ route: "BooksObjectPage", params: { key: "251" }, componentTargetInfo: undefined });
    expect(page.url()).toContain("#/Books(251)");
    await expect(ui5.control({ controlType: "sap.uxap.ObjectPageLayout" })).toBeUI5Visible();

    await expect(ui5.goTo({ route: "Nope" })).rejects.toThrow(/route 'Nope' does not exist .*routes: BooksList, BooksObjectPage/);
  });

  test("fails with a helpful message when nothing matches", async ({ ui5 }) => {
    await expect(ui5.control({ controlType: "sap.m.Button", properties: { text: "Nope" } }, { timeout: 1500 })).rejects.toThrow(
      /no control found for selector .*Nope/
    );
    expect(await ui5.controlOrNull({ id: "does-not-exist" }, { timeout: 500 })).toBeNull();
  });
});

test.describe("control API (app inside an iframe, like SAP Build Work Zone)", () => {
  test("auto-detects the application iframe", async ({ ui5, page }) => {
    await page.goto("/test/iframe.html");
    const frame = await ui5.appFrame();
    expect(frame).not.toBe(page.mainFrame());
    expect(frame.url()).toContain("/index.html");

    await ui5.enterText(AUTHOR_FILTER, "Charlotte Brontë");
    await ui5.press(GO_BUTTON);
    await expect(ui5.controls(ROW)).toHaveUI5Count(1);
    await expect(await ui5.locator(GO_BUTTON)).toBeVisible();
  });

  test("uses an explicit iframe selector", async ({ page, ui5 }) => {
    test.info().annotations.push({ type: "option", description: "appFrame: '#application-frame'" });
    const { UI5 } = await import("@ahangl/playwright-ui5");
    await page.goto("/test/iframe.html");
    const explicit = new UI5(page, { appFrame: "#application-frame" });
    expect((await explicit.appFrame()).url()).toContain("/index.html");
    expect(await (await explicit.control(GO_BUTTON)).getText()).toBe("Go");
    void ui5;
  });
});
