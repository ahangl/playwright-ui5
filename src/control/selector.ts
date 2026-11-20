/**
 * UI5 control selector, as understood by `sap/ui/test/RecordReplay` (the same format wdi5 and
 * UI5 OPA declarative matchers use). String values can be replaced by RegExp objects where UI5
 * supports it (e.g. `id`, `properties`).
 */
export interface UI5Selector {
  /** Global control id, or a RegExp. With `viewName`/`viewId` it is the id relative to the view. */
  id?: string | RegExp;
  viewName?: string;
  viewId?: string;
  /** Fully qualified control class, e.g. `"sap.m.Button"`. */
  controlType?: string;
  /** Property values the control must have, e.g. `{ text: "Save" }`. */
  properties?: Record<string, unknown>;
  bindingPath?: {
    path?: string;
    propertyPath?: string;
    modelName?: string;
  };
  i18NText?: {
    propertyName: string;
    key: string;
    modelName?: string;
    parameters?: unknown[];
    useLibraryBundle?: boolean;
  };
  labelFor?: {
    text?: string;
    key?: string;
    modelName?: string;
    propertyName?: string;
  };
  ancestor?: UI5Selector;
  descendant?: UI5Selector;
  sibling?: UI5Selector;
  /** Only match controls that can be interacted with (visible, enabled, not busy). */
  interactable?: boolean;
  /** Only search inside open dialogs/popovers. */
  searchOpenDialogs?: boolean;
  /**
   * Which DOM element of the control `locator()` and `press({ native: true })` use (as in wdi5 /
   * RecordReplay): `"root"` (default), `"focus"` (e.g. the inner `<input>`), `"press"`, `"auto"`,
   * or `{ idSuffix }` for the element with id `<control id>-<idSuffix>`.
   */
  interaction?: "root" | "focus" | "press" | "auto" | { idSuffix: string };
  [key: string]: unknown;
}
