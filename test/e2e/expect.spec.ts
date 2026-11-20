/* eslint-disable @typescript-eslint/no-explicit-any -- UI5 controls inside exec() callbacks are untyped. */
import { test, expect } from "@ahangl/playwright-ui5";

const GO_BUTTON = { controlType: "sap.m.Button", properties: { text: "Go" } };
const AUTHOR_FILTER = { controlType: "sap.ui.mdc.FilterField", properties: { label: "Author" } };
const ROW = { controlType: "sap.m.ColumnListItem" };
const TABLE = { controlType: "sap.m.Table" };

test.describe("retrying UI5 assertions", () => {
  test.beforeEach(async ({ ui5 }) => {
    await ui5.goTo("/index.html");
  });

  test("retries until the property changes", async ({ ui5 }) => {
    const go = await ui5.control(GO_BUTTON);
    await go.exec((control: any) => {
      control.setEnabled(false);
      // longer than the timeouts UI5 itself waits for, so waitForUI5() alone would not see the change
      setTimeout(() => control.setEnabled(true), 1500);
    });
    await expect(go).not.toBeUI5Enabled({ timeout: 300 });
    await expect(ui5.control(GO_BUTTON)).toBeUI5Enabled();
    await expect(go).toHaveUI5Property("enabled", true);
  });

  test("text, RegExp and .not", async ({ ui5 }) => {
    await expect(ui5.control(GO_BUTTON)).toHaveUI5Text("Go");
    await expect(ui5.control(GO_BUTTON)).toHaveUI5Text(/^g/i);
    await expect(ui5.control(GO_BUTTON)).not.toHaveUI5Text("Stop");
  });

  test("counts the matches of a selector", async ({ ui5 }) => {
    await expect(ui5.controls(ROW)).toHaveUI5Count(5);
    await ui5.enterText(AUTHOR_FILTER, "Edgar Allan Poe");
    await ui5.press(GO_BUTTON);
    await expect(ui5.controls(ROW)).toHaveUI5Count(2);
  });

  test("works on chains", async ({ ui5 }) => {
    await expect(ui5.control(TABLE).getItems(0)).toHaveUI5BindingPath("/Books(201)");
    await expect(ui5.control(TABLE).getItems(0)).toBeUI5Visible();
  });

  test("visibility", async ({ ui5 }) => {
    const go = await ui5.control(GO_BUTTON);
    await go.exec((control: any) => control.setVisible(false));
    await expect(go).not.toBeUI5Visible();
    await expect(ui5.control({ id: "does-not-exist" })).not.toBeUI5Visible({ timeout: 500 });
  });

  test("failure message shows the control, expected and received values", async ({ ui5 }) => {
    const error = await expect(ui5.control(GO_BUTTON))
      .toHaveUI5Text("Stop", { timeout: 1000 })
      .then(
        () => undefined,
        (e: Error) => e
      );
    // eslint-disable-next-line no-control-regex -- drops the ANSI color codes
    if (error) error.message = error.message.replace(/\u001b\[\d+m/g, "");
    expect(error?.message).toContain("toHaveUI5Text");
    expect(error?.message).toContain('Control: ui5.control({"controlType":"sap.m.Button","properties":{"text":"Go"}})');
    expect(error?.message).toContain('Expected: "Stop"');
    expect(error?.message).toContain('Received: "Go"');
    expect(error?.message).toContain("Timeout: 1000ms");
  });
});
