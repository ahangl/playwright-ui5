/* eslint-disable @typescript-eslint/no-explicit-any -- the chains are `any` without @sapui5/types. */
/*
 * Types for the Fiori elements test library facade.
 *
 * The method signatures come from SAP's own typings of `sap.fe.test` in `@sapui5/types`
 * (optional peer dependency). Without it installed, the chains are untyped (`any`) but work the same.
 * The build marks these imports with `// @ts-ignore` in dist (scripts/mark-optional-types.mjs).
 */
import type ListReport from "sap/fe/test/ListReport";
import type ObjectPage from "sap/fe/test/ObjectPage";
import type Shell from "sap/fe/test/Shell";

/** Constructor settings of `sap.fe.test.ListReport` / `sap.fe.test.ObjectPage`. */
export interface FioriElementsPageDefinition {
  /** `sap.app.id` from the manifest. */
  appId: string;
  /** Id of the routing target in the manifest, for example, `"BooksList"` / `"BooksObjectPage"`. */
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
 * Page objects by name, for example
 * `{ onTheMainPage: { ListReport: {...} }, onTheDetailPage: { ObjectPage: {...} }, onTheShell: { Shell: {} } }`.
 */
export type FioriElementsPages = Record<string, FioriElementsPageConfig>;

/**
 * Stands for a sap.fe.test type when `@sapui5/types` is not installed. The `sap/*` imports are then
 * unresolved, and TypeScript's error type would turn every generic type built from them into `any`. The
 * check must therefore happen here, outside of generics; the chains map this marker to
 * {@link UntypedFioriElementsChain}.
 */
interface MissingSapTypes {
  readonly __pwui5MissingSapTypes: true;
}

type ListReportActions = 0 extends 1 & typeof ListReport.actions ? MissingSapTypes : typeof ListReport.actions;
type ListReportAssertions = 0 extends 1 & typeof ListReport.assertions ? MissingSapTypes : typeof ListReport.assertions;
type ObjectPageActions = 0 extends 1 & typeof ObjectPage.actions ? MissingSapTypes : typeof ObjectPage.actions;
type ObjectPageAssertions = 0 extends 1 & typeof ObjectPage.assertions ? MissingSapTypes : typeof ObjectPage.assertions;
type ShellApi = 0 extends 1 & Shell ? MissingSapTypes : Shell;

type ActionsOf<C> = C extends { ListReport: unknown }
  ? ListReportActions
  : C extends { ObjectPage: unknown }
    ? ObjectPageActions
    : C extends { Shell: unknown }
      ? ShellApi
      : never;

type AssertionsOf<C> = C extends { ListReport: unknown }
  ? ListReportAssertions
  : C extends { ObjectPage: unknown }
    ? ObjectPageAssertions
    : C extends { Shell: unknown }
      ? ShellApi
      : never;

/** sap.fe.test methods typed as returning `object` continue on the same API object. */
type Next<T, R> = 0 extends 1 & R ? T : [R] extends [object] ? ([object] extends [R] ? T : R) : T;

/**
 * A recorded statement chain. Every method call returns a {@link FioriElementsStep} that can be continued
 * (directly or via `.and`) and must finally be awaited to execute it in the browser.
 */
export type FioriElementsChain<T> = [T] extends [MissingSapTypes]
  ? UntypedFioriElementsChain
  : 0 extends 1 & T
    ? any
    : {
        [K in keyof T as T[K] extends (...args: any[]) => any ? K : never]-?: K extends "onTable"
          ? OnTableMethod<T[K], T>
          : ChainMethod<T[K], T>;
      };

/**
 * Identifies a table for `onTable()`. Object page: its header title, or the navigation property and qualifier.
 * List report: the id part (`"Books"` for `fe::table::Books::LineItem`); a qualifier is ignored.
 * The same shape as `sap.fe.test.api.TableIdentifier`. An empty object is not an identifier: it builds the
 * table id `fe::table::undefined::LineItem`.
 */
export type FioriElementsTableIdentifier = string | { property: string; qualifier?: string };

/**
 * `onTable(table?)` of the ListReport and ObjectPage actions and assertions. Without an argument a list report
 * uses its only table; an object page needs an argument. `@sapui5/types` before 1.150 declares it as required.
 */
type OnTableMethod<F, T> = F extends (...args: any[]) => infer R
  ? (table?: FioriElementsTableIdentifier) => FioriElementsStep<Next<T, R>>
  : never;

/** Chains without `@sapui5/types`: any method compiles, but `onTable` still rejects an empty object. */
export interface UntypedFioriElementsChain {
  onTable(table?: FioriElementsTableIdentifier): any;
  [method: string]: any;
}

/** Keeps up to 4 overloads of a sap.fe.test method (for example, both `iChangeRow` signatures). */
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
