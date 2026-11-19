import { build } from "esbuild";
import { defineConfig } from "tsup";
import type { Plugin } from "esbuild";

/**
 * Resolves `import source from "virtual:pwui5-bridge"` to the bundled (IIFE) source code of
 * src/browser/bridge.ts, so the bridge ships as a string inside the library.
 */
const bridgeSourcePlugin: Plugin = {
  name: "pwui5-bridge-source",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^virtual:pwui5-bridge$/ }, () => ({
      path: "bridge",
      namespace: "pwui5-bridge",
    }));
    pluginBuild.onLoad({ filter: /.*/, namespace: "pwui5-bridge" }, async () => {
      const result = await build({
        entryPoints: ["src/browser/bridge.ts"],
        bundle: true,
        format: "iife",
        target: "es2019",
        minify: true,
        write: false,
      });
      return {
        contents: `export default ${JSON.stringify(result.outputFiles[0].text)};`,
        loader: "js",
        watchFiles: ["src/browser/bridge.ts"],
      };
    });
  },
};

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node18",
  external: ["@playwright/test"],
  esbuildPlugins: [bridgeSourcePlugin],
});
