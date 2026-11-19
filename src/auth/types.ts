import type { Page } from "@playwright/test";

export interface Credentials {
  username: string;
  password: string;
}

export interface LoginContext {
  /** URL of the protected application / Work Zone site to open. */
  url: string;
  credentials: Credentials;
  /** Maximum time in ms for the whole login. */
  timeout: number;
}

/**
 * An authentication provider performs the interactive login for one kind of identity provider.
 * Implement this interface for custom IdPs.
 */
export interface AuthProvider {
  readonly name: string;
  /** Opens `ctx.url`, logs in, and resolves once the browser is back on the application. */
  login(page: Page, ctx: LoginContext): Promise<void>;
}
