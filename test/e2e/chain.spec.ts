/* eslint-disable @typescript-eslint/no-explicit-any -- UI5 controls inside exec() callbacks are untyped. */
import { test, expect, type RemoteControl } from "@ahangl/playwright-ui5";
import type Table from "sap/m/Table";
import type Button from "sap/m/Button";

const TABLE = { controlType: "sap.m.Table" };
const GO_BUTTON = { controlType: "sap.m.Button", properties: { text: "Go" } };

async function errorOf(p: PromiseLike<unknown>): Promise<Error | undefined> {
  return Promise.resolve(p).then(
    () => undefined,
    (e: Error) => e
  );
}

test.describe("fluent chaining", () => {
  test.beforeEach(async ({ ui5 }) => {
    await ui5.goTo("/index.html");
  });

  test("runs a typed chain with a single await", async ({ ui5 }) => {
    expect(await ui5.control<Table>(TABLE).getItems(0).getBindingContextPath()).toBe("/Books(201)");
    expect(await ui5.control<Table>(TABLE).getItems(0).getBindingContext()!.getProperty("title")).toBe(
      "Wuthering Heights"
    );
    expect(await ui5.control<Button>(GO_BUTTON).getText()).toBe("Go");
  });

  test("index shortcut for aggregations, like wdi5", async ({ ui5 }) => {
    const table = await ui5.control<Table>(TABLE);
    const items = await table.getItems();
    expect(items).toHaveLength(5);
    const second = await table.getItems(1);
    expect(second.id).toBe(items[1].id);
  });

  test("awaiting the same chain twice runs it once", async ({ ui5 }) => {
    const chain = ui5.control(TABLE).getItems(0);
    const first = await chain;
    expect(await chain).toBe(first);
  });

  test("helpers work directly on a chain", async ({ ui5 }) => {
    await expect(await ui5.control(GO_BUTTON).locator()).toBeVisible();
    await ui5.control(GO_BUTTON).press();
    expect(await ui5.control<Table>(TABLE).getItems(0).getBindingContextPath()).toBe("/Books(201)");
  });

  test("reports the failing step with what the previous steps returned", async ({ ui5 }) => {
    const error = await errorOf(ui5.control(TABLE).getItems(0).getNope());
    expect(error?.message).toContain(
      'ui5.control({"controlType":"sap.m.Table"}).getItems(0).getNope() failed at .getNope():'
    );
    expect(error?.message).toContain("'getNope' is not a function on sap.m.ColumnListItem");
    expect(error?.message).toMatch(/✔ ui5\.control\(.*\) → sap\.m\.Table#/);
    expect(error?.message).toMatch(/✔ getItems\(0\) → sap\.m\.ColumnListItem#/);
    expect(error?.message).toContain("✘ getNope()");
    expect(error?.stack?.split("\n").at(-1)).toMatch(/^\s+at .*chain\.spec\.ts:\d+:\d+/);
  });

  test("reports an index out of range", async ({ ui5 }) => {
    const error = await errorOf(ui5.control(TABLE).getItems(99).getId());
    expect(error?.message).toContain("index 99 out of range (getItems() returned 5 items)");
    expect(error?.stack).toContain("chain.spec.ts");
  });

  test("reports null or undefined in the middle of a chain", async ({ ui5 }) => {
    const error = await errorOf(ui5.control(GO_BUTTON).getTooltip().getText());
    expect(error?.message).toMatch(/previous step returned (null|undefined), nothing to call getText\(\) on/);
  });

  test("keeps the 'no control found' message", async ({ ui5 }) => {
    const error = await errorOf(ui5.control({ id: "nope" }, { timeout: 500 }).getText());
    expect(error?.message).toMatch(
      /no control found for selector \{"id":"nope"\} within 500ms\n {2}in ui5\.control\(.*\)\.getText\(\)/
    );
    expect(error?.stack).toContain("chain.spec.ts");
  });

  test("chains continue after press() and enterText()", async ({ ui5 }) => {
    expect(await ui5.control<Button>(GO_BUTTON).press().getText()).toBe("Go");

    const author = await ui5.control({ controlType: "sap.ui.mdc.FilterField", properties: { label: "Author" } });
    const conditions = await author.enterText("Edgar Allan Poe").getConditions();
    expect(conditions).toHaveLength(1);

    // awaiting an action without continuing resolves to the control
    const pressed = await ui5.control(GO_BUTTON).press();
    expect(pressed.className).toBe("sap.m.Button");
  });

  test("a failed press points at the test line", async ({ ui5 }) => {
    const go = await ui5.control(GO_BUTTON, { timeout: 1_000 });
    await go.exec((control: any) => control.setEnabled(false));

    const direct = await errorOf(go.press());
    expect(direct?.message).toMatch(/is not interactable/);
    expect(direct?.stack?.split("\n").at(-1)).toMatch(/^\s+at .*chain\.spec\.ts:\d+:\d+/);

    const shortcut = await errorOf(ui5.press(GO_BUTTON, { timeout: 1_000 }));
    expect(shortcut?.message).toMatch(/is not interactable/);
    expect(shortcut?.stack?.split("\n").at(-1)).toMatch(/^\s+at .*chain\.spec\.ts:\d+:\d+/);
  });

  test("an action resolves to the freshly described control", async ({ ui5 }) => {
    const pressed = await ui5.control(GO_BUTTON).press();
    expect(pressed.domRefId).toBe((await pressed.reload()).domRefId);
    // the retrying matchers re-read the control of an action chain
    await expect(ui5.control(GO_BUTTON).press()).toBeUI5Enabled({ timeout: 2_000 });
  });

  test("an action that destroys its control still succeeds", async ({ ui5 }) => {
    await ui5.exec(() => {
      const Button = (window as any).sap.ui.require("sap/m/Button");
      new Button({
        text: "Self-destruct",
        press(this: any) {
          this.destroy();
        }
      }).placeAt(document.body);
    });
    const button = await ui5.control({ controlType: "sap.m.Button", properties: { text: "Self-destruct" } });
    const pressed = await button.press();
    expect(pressed.id).toBe(button.id);
    expect(await ui5.controlOrNull({ id: button.id }, { timeout: 500 })).toBeNull();
  });

  test("a failed action rejects the chain and later steps do not run", async ({ ui5 }) => {
    const go = await ui5.control(GO_BUTTON, { timeout: 1_000 });
    await go.exec((control: any) => control.setEnabled(false));
    const error = await errorOf(go.press().setText("changed"));
    expect(error?.message).toMatch(/is not interactable .*enabled=false/);
    expect(error?.stack).toContain("chain.spec.ts");
    await go.exec((control: any) => control.setEnabled(true));
    expect(await go.getText()).toBe("Go");
  });

  test("methods of remote controls are chainable too", async ({ ui5 }) => {
    const table = await ui5.control(TABLE);
    const row = (await table.getItems(0)) as RemoteControl;
    expect(await row.getBindingContext().getPath()).toBe("/Books(201)");
    // a remote control passed as an argument is still the same UI5 object in the browser
    expect(await table.indexOfItem(row)).toBe(0);
  });
});
