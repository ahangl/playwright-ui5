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
export interface FEPageDefinition {
  /** `sap.app.id` from the manifest. */
  appId: string;
  /** Id of the routing target in the manifest, e.g. `"BooksList"` / `"BooksObjectPage"`. */
  componentId: string;
  entitySet?: string;
  contextPath?: string;
}

/** One page object, keyed by the sap.fe.test page class. */
export type FEPageConfig =
  | { ListReport: FEPageDefinition }
  | { ObjectPage: FEPageDefinition }
  | { Shell: Record<string, never> };

/**
 * Page objects by name, e.g.
 * `{ onTheMainPage: { ListReport: {...} }, onTheDetailPage: { ObjectPage: {...} }, onTheShell: { Shell: {} } }`.
 */
export type FEPages = Record<string, FEPageConfig>;

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
 * A recorded statement chain. Every method call returns a {@link FEStep} that can be continued
 * (directly or via `.and`) and must finally be awaited to execute it in the browser.
 */
export type FEChain<T> = 0 extends 1 & T
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
  ? ((...args: A1) => FEStep<Next<T, R1>>) &
      ((...args: A2) => FEStep<Next<T, R2>>) &
      ((...args: A3) => FEStep<Next<T, R3>>) &
      ((...args: A4) => FEStep<Next<T, R4>>)
  : F extends (...args: infer A) => infer R
    ? (...args: A) => FEStep<Next<T, R>>
    : never;

export type FEStep<T> = FEChain<T> & { readonly and: FEChain<T> } & PromiseLike<void>;

export type FEKind = "given" | "when" | "then";

/** Root object of `Given`/`When`/`Then`: one property per configured page. */
export type FERoot<P extends FEPages, K extends FEKind> = {
  readonly [Name in keyof P]: FEChain<K extends "then" ? AssertionsOf<P[Name]> : ActionsOf<P[Name]>>;
};

export interface FEJourney<P extends FEPages> {
  /** Arrangements (OPA `Given`). Page actions can be used here too. */
  readonly Given: FERoot<P, "given">;
  /** Actions (OPA `When`). */
  readonly When: FERoot<P, "when">;
  /** Assertions (OPA `Then`). */
  readonly Then: FERoot<P, "then">;
}
