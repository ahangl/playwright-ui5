import fs from "node:fs";
import path from "node:path";
import { test, expect, ias, login } from "@ahangl/playwright-ui5";
import type { BrowserContext } from "@playwright/test";

/**
 * Simulates the redirect chain of SAP Build Work Zone -> (XSUAA IdP selection) -> SAP IAS login
 * -> back to Work Zone, entirely with request routing. All hosts use the reserved `.test` TLD and
 * every other request is aborted, so nothing ever leaves the machine.
 * (Redirects are done in the page because requests following a fulfilled 302 are not routed.)
 */
const WORKZONE = "https://workzone.example.test";
const SITE = `${WORKZONE}/site`;
const IAS = "https://ias.example.test";
const XSUAA = "https://xsuaa.example.test";
const USER = { username: "tester@example.com", password: "secret" };

type Flow = "onepage" | "identifier-first";

async function fakeLandscape(context: BrowserContext, options: { flow: Flow; idpSelection?: boolean }) {
  const html = (body: string, headers: Record<string, string> = {}) => ({
    status: 200,
    contentType: "text/html",
    headers,
    body: `<!doctype html><html><body>${body}</body></html>`
  });
  const redirect = (location: string, headers: Record<string, string> = {}) =>
    html(`<script>location.replace(${JSON.stringify(location)})</script>`, headers);
  const form = (fields: string, error = "") =>
    html(`<form method="post" action="${IAS}/saml2/idp/sso">${fields}
      <button id="logOnFormSubmit" type="submit">Continue</button>${error}</form>`);

  // registered first = lowest priority: block everything that is not explicitly faked
  await context.route("**/*", (route) => route.abort());

  await context.route(`${WORKZONE}/**`, (route) => {
    const req = route.request();
    if (new URL(req.url()).pathname === "/callback") {
      return route.fulfill(redirect(SITE, { "set-cookie": "WZSESSION=ok; Path=/; Secure; HttpOnly" }));
    }
    const cookie = req.headers()["cookie"] ?? "";
    if (cookie.includes("WZSESSION=ok")) return route.fulfill(html(`<div id="shell">Work Zone home</div>`));
    return route.fulfill(redirect(options.idpSelection ? `${XSUAA}/login` : `${IAS}/saml2/idp/sso`));
  });
  await context.route(`${XSUAA}/**`, (route) =>
    route.fulfill(
      html(`<a href="${IAS}/saml2/idp/sso?idp=other.example.test">Other</a>
            <a href="${IAS}/saml2/idp/sso?idp=tenant.example.test">Tenant IAS</a>`)
    )
  );
  await context.route(`${IAS}/**`, (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      return route.fulfill(
        options.flow === "onepage"
          ? form(`<input id="j_username" name="j_username"><input id="j_password" name="j_password" type="password">`)
          : form(`<input id="j_username" name="j_username">`)
      );
    }
    const data = new URLSearchParams(req.postData() ?? "");
    const username = data.get("j_username");
    const password = data.get("j_password");
    if (password === null) {
      // identifier-first: second page asks for the password
      return route.fulfill(
        form(
          `<input type="hidden" name="j_username" value="${username}"><input id="j_password" name="j_password" type="password">`
        )
      );
    }
    if (username === USER.username && password === USER.password) {
      return route.fulfill(redirect(`${WORKZONE}/callback`));
    }
    return route.fulfill(
      form(
        `<input id="j_username" name="j_username"><input id="j_password" name="j_password" type="password">`,
        `<div id="logOnFormErrorMessage">Sorry, we could not authenticate you. Try again.</div>`
      )
    );
  });
}

test.describe("SAP IAS authentication", () => {
  test("one-page form, session stored for reuse", async ({ page, context }, testInfo) => {
    await fakeLandscape(context, { flow: "onepage" });
    const statePath = testInfo.outputPath("state.json");
    await login(page, { url: SITE, provider: ias(), credentials: USER, storageStatePath: statePath });

    await expect(page.locator("#shell")).toHaveText("Work Zone home");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    expect(state.cookies.map((c: { name: string }) => c.name)).toContain("WZSESSION");
    expect(path.isAbsolute(statePath)).toBe(true);
  });

  test("identifier-first flow (username, continue, password)", async ({ page, context }) => {
    await fakeLandscape(context, { flow: "identifier-first" });
    await login(page, { url: SITE, provider: ias(), credentials: USER });
    await expect(page.locator("#shell")).toBeVisible();
  });

  test("picks the configured IdP on the XSUAA selection page", async ({ page, context }) => {
    await fakeLandscape(context, { flow: "onepage", idpSelection: true });
    await login(page, { url: SITE, provider: ias({ idpDomain: "tenant.example.test" }), credentials: USER });
    await expect(page.locator("#shell")).toBeVisible();
  });

  test("reports the IdP error message for wrong credentials", async ({ page, context }) => {
    await fakeLandscape(context, { flow: "onepage" });
    await expect(
      login(page, { url: SITE, provider: ias(), credentials: { ...USER, password: "wrong" }, timeout: 5_000 })
    ).rejects.toThrow(/did not complete: Sorry, we could not authenticate you/);
  });

  test("does nothing when the session is still valid", async ({ page, context }) => {
    await fakeLandscape(context, { flow: "onepage" });
    await context.addCookies([{ name: "WZSESSION", value: "ok", url: WORKZONE }]);
    await login(page, { url: SITE, provider: ias(), credentials: USER });
    await expect(page.locator("#shell")).toBeVisible();
    expect(page.url()).toBe(SITE);
  });
});
