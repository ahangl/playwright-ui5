/*
 * Types for the Fiori elements test library facade.
 *
 * The method signatures come from SAP's own typings of `sap.fe.test` in `@sapui5/types`
 * (optional peer dependency). Without it installed, the chains are untyped (`any`) but work the same.
 */
import type ListReport from "sap/fe/test/ListReport";
import type ObjectPage from "sap/fe/test/ObjectPage";
import type Shell from "sap/fe/test/Shell";

/** Constructor settings of `sap.fe.test.ListReport` / `sap.fe.test.ObjectPage`. */
export interface FioriElementsPageDefinition {
  /** `sap.app.id` from the manifest. */
  appId: string;
  /** Id of the routing target in the manifest, e.g. `"BooksList"` / `"BooksObjectPage"`. */
  componentId: string;
  entitySet?: string;
  contextPath?: string;
}

/** One page object, keyed by the sap.fe.test page class. */
export type FioriElementsPageConfig =
  | { ListReport: FioriElementsPageDefinition }
  | { ObjectPage: FioriElementsPageDefinition }
  | { Shell: Record<string, never> };

/**
 * Page objects by name, e.g.
 * `{ onTheMainPage: { ListReport: {...} }, onTheDetailPage: { ObjectPage: {...} }, onTheShell: { Shell: {} } }`.
 */
export type FioriElementsPages = Record<string, FioriElementsPageConfig>;

type ListReportActions = typeof ListReport.actions;
type ListReportAssertions = typeof ListReport.assertions;
type ObjectPageActions = typeof ObjectPage.actions;
type ObjectPageAssertions = typeof ObjectPage.assertions;

type ActionsOf<C> = C extends { ListReport: unknown }
  ? ListReportActions
  : C extends { ObjectPage: unknown }
    ? ObjectPageActions
    : C extends { Shell: unknown }
      ? Shell
      : never;

type AssertionsOf<C> = C extends { ListReport: unknown }
  ? ListReportAssertions
  : C extends { ObjectPage: unknown }
    ? ObjectPageAssertions
    : C extends { Shell: unknown }
      ? Shell
      : never;

/** sap.fe.test methods typed as returning `object` continue on the same API object. */
type Next<T, R> = 0 extends 1 & R ? T : [R] extends [object] ? ([object] extends [R] ? T : R) : T;

/**
 * A recorded statement chain. Every method call returns a {@link FioriElementsStep} that can be continued
 * (directly or via `.and`) and must finally be awaited to execute it in the browser.
 */
export type FioriElementsChain<T> = 0 extends 1 & T
  ? any
  : {
      [K in keyof T as T[K] extends (...args: any[]) => any ? K : never]-?: ChainMethod<T[K], T>;
    };

/** Keeps up to 4 overloads of a sap.fe.test method (e.g. `iCheckRows(5)` and `iCheckRows({...}, 1)`). */
type ChainMethod<F, T> = F extends {
  (...args: infer A1): infer R1;
  (...args: infer A2): infer R2;
  (...args: infer A3): infer R3;
  (...args: infer A4): infer R4;
}
  ? ((...args: A1) => FioriElementsStep<Next<T, R1>>) &
      ((...args: A2) => FioriElementsStep<Next<T, R2>>) &
      ((...args: A3) => FioriElementsStep<Next<T, R3>>) &
      ((...args: A4) => FioriElementsStep<Next<T, R4>>)
  : F extends (...args: infer A) => infer R
    ? (...args: A) => FioriElementsStep<Next<T, R>>
    : never;

export type FioriElementsStep<T> = FioriElementsChain<T> & { readonly and: FioriElementsChain<T> } & PromiseLike<void>;

export type FioriElementsKind = "given" | "when" | "then";

/** Root object of `Given`/`When`/`Then`: one property per configured page. */
export type FioriElementsRoot<P extends FioriElementsPages, K extends FioriElementsKind> = {
  readonly [Name in keyof P]: FioriElementsChain<K extends "then" ? AssertionsOf<P[Name]> : ActionsOf<P[Name]>>;
};

export interface FioriElementsJourney<P extends FioriElementsPages> {
  /** Arrangements (OPA `Given`). Page actions can be used here too. */
  readonly Given: FioriElementsRoot<P, "given">;
  /** Actions (OPA `When`). */
  readonly When: FioriElementsRoot<P, "when">;
  /** Assertions (OPA `Then`). */
  readonly Then: FioriElementsRoot<P, "then">;
}
