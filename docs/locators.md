# Locators

::: info Works in every UI5 app
Selectors find any UI5 control: in freestyle apps, in Fiori elements V2 and V4 apps, and in the launchpad shell (`ui5.shell`).
:::

Controls are found with the selector format of UI5's `sap/ui/test/RecordReplay`. It's the same format wdi5 and OPA's declarative matchers use, so wdi5 selectors work unchanged. In playwright-ui5 you pass the selector directly, without wdi5's `{ selector: ... }` wrapper.

## Selector fields

| Field                               | Matches                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| `id`                                | Global control id, or a RegExp. With `viewName` / `viewId` it is the id relative to the view.       |
| `viewName`, `viewId`                | Controls of that view.                                                                              |
| `controlType`                       | The fully qualified class, e.g. `"sap.m.Button"`.                                                   |
| `properties`                        | Property values, e.g. `{ text: "Save" }`. Values can be RegExps.                                    |
| `bindingPath`                       | `{ path?, propertyPath?, modelName? }` of the control's binding.                                    |
| `i18NText`                          | `{ propertyName, key, modelName?, parameters?, useLibraryBundle? }`: a property shows an i18n text. |
| `labelFor`                          | `{ text?, key?, modelName?, propertyName? }`: the control is labeled by a label with that text.     |
| `ancestor`, `descendant`, `sibling` | A nested selector for a related control.                                                            |
| `interactable`                      | Only controls that can be interacted with (visible, enabled, not busy).                             |
| `searchOpenDialogs`                 | Only search inside open dialogs and popovers.                                                       |
| `interaction`                       | Which DOM element `locator()` and `press({ native: true })` use (see [below](#interaction)).        |

## Examples

```ts
// by id within a view
await ui5.control({ viewName: "my.app.view.Main", id: "saveButton" });

// by class and property, also with a RegExp
await ui5.control({ controlType: "sap.m.Button", properties: { text: "Go" } });
await ui5.control({ controlType: "sap.m.Button", properties: { text: /^go$/i } });

// the declarative RegExp notation of wdi5 / OPA works too
await ui5.control({ controlType: "sap.m.Button", properties: { text: { regex: { source: "^g", flags: "i" } } } });

// by binding path
await ui5.control({ controlType: "sap.m.ColumnListItem", bindingPath: { path: "/Books(201)" } });

// by i18n text
await ui5.control({ controlType: "sap.m.Button", i18NText: { propertyName: "text", key: "SAVE" } });

// by label
await ui5.control({ controlType: "sap.m.Input", labelFor: { text: "Author" } });

// inside another control
await ui5.control({
  controlType: "sap.m.Button",
  properties: { text: "OK" },
  ancestor: { controlType: "sap.m.Dialog" }
});

// only in open dialogs
await ui5.control({ controlType: "sap.m.Button", properties: { text: "OK" }, searchOpenDialogs: true });
```

If more than one control matches, `ui5.control()` returns the one RecordReplay finds first. Make the selector unique (e.g. with `ancestor` or `bindingPath`), or use `ui5.controls()` for all matches.

## interaction

`interaction` chooses the DOM element of the control that `locator()` and `press({ native: true })` use:

- `"root"` (default): the control's root element.
- `"focus"`: e.g. the inner `<input>` of an input field.
- `"press"`, `"auto"`, or `{ idSuffix: "inner" }` for the element with the id `<control id>-inner`.

```ts
const input = await ui5.locator({ controlType: "sap.m.Input", labelFor: { text: "Author" }, interaction: "focus" });
await input.fill("Edgar Allan Poe"); // native typing, no change event yet
await input.press("Enter");
```

If the control has no such element, the call fails right away with a clear message.

## Playwright locators

For anything that isn't a UI5 control, use Playwright's locators on the app frame:

```ts
const frame = await ui5.appFrame();
await frame.getByRole("button", { name: "Go" }).click();
```

Prefer UI5 selectors for UI5 controls. They don't depend on generated ids or rendering details, and they wait for UI5 to be idle.
