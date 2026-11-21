import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";

const base = "/playwright-ui5/";

export default defineConfig({
  title: "@ahangl/playwright-ui5",
  description:
    "UI5-aware end-to-end testing for Playwright: control API, retrying assertions, Fiori elements test library",
  base,
  cleanUrls: true,
  lastUpdated: false,
  vite: {
    plugins: [llmstxt({ excludeIndexPage: false })]
  },
  themeConfig: {
    nav: [
      { text: "Getting started", link: "/installation", activeMatch: "^/(installation|migration-wdi5|migration-opa)$" },
      { text: "Guide", link: "/usage", activeMatch: "^/(?!api/|installation$|migration-)." },
      { text: "Reference", link: "/api/", activeMatch: "^/api/" },
      { text: "llms.txt", link: `${base}llms.txt`, target: "_self" },
      { text: "npm", link: "https://www.npmjs.com/package/@ahangl/playwright-ui5" }
    ],
    sidebar: [
      {
        text: "Getting started",
        items: [
          { text: "Introduction", link: "/" },
          { text: "Installation", link: "/installation" },
          { text: "Migration from wdi5", link: "/migration-wdi5" },
          { text: "Migration from OPA", link: "/migration-opa" }
        ]
      },
      {
        text: "Guide",
        items: [
          { text: "Running and debugging", link: "/running" },
          { text: "Usage", link: "/usage" },
          { text: "Locators", link: "/locators" },
          { text: "Authentication", link: "/authentication" },
          { text: "Configuration", link: "/configuration" }
        ]
      },
      {
        text: "Fiori elements V4",
        items: [
          { text: "Test library (sap.fe.test)", link: "/fe-testlib" },
          { text: "Troubleshooting", link: "/fe-troubleshooting" }
        ]
      },
      {
        text: "Reference",
        items: [
          { text: "API reference", link: "/api/" },
          { text: "fe", link: "/api/fe" },
          { text: "ui5", link: "/api/ui5" },
          { text: "expect", link: "/api/expect" }
        ]
      },
      {
        text: "More",
        items: [
          { text: "Cookbook", link: "/cookbook" },
          { text: "Known limitations", link: "/limitations" }
        ]
      }
    ],
    outline: [2, 3],
    search: { provider: "local" },
    socialLinks: [{ icon: "github", link: "https://github.com/ahangl/playwright-ui5" }],
    footer: { message: "Released under the MIT License." }
  }
});
