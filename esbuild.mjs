import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";

// vfm is an npm dependency (github:vgandari/vfm). Set VFM_DIR to build against a local checkout instead.
const vfmDir = path.resolve(process.env.VFM_DIR ?? "node_modules/vfm");


const watch = process.argv.includes("--watch");

const common = {
  bundle: true,
  sourcemap: watch,
  logLevel: "info",
  alias: { "@vfm": vfmDir },
  nodePaths: [path.resolve("node_modules")], // vfm may be a symlink/checkout without its own node_modules
};

const extension = {
  ...common,
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
};

const webview = {
  ...common,
  entryPoints: ["src/webview/main.tsx"],
  outdir: "dist/webview",
  entryNames: "main",
  assetNames: "assets/[name]-[hash]",
  platform: "browser",
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  // pseudocode 2.4.1 depends on sloppy-mode implicit globals (`attrVal`, `ifCond`, `katex = require(...)`
  // in src/Renderer.js). Under "use strict" every algorithm block throws a ReferenceError or finds no
  // math backend. tsconfig's `strict` makes esbuild emit "use strict" for the whole bundle, so turn
  // that directive off for the webview.
  tsconfigRaw: { compilerOptions: { alwaysStrict: false, jsx: "react-jsx" } },
  minify: !watch && !process.env.NO_MINIFY,
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
  loader: {
    ".module.css": "local-css",
    ".woff": "file",
    ".woff2": "file",
    ".ttf": "file",
  },
};

/** Fails the build if the page's stylesheet would fetch anything: no @import, no remote url(). */
function assertNoRemoteCss() {
  const css = fs.readFileSync("dist/webview/main.css", "utf8");
  const bad = css.match(/@import[^;]*;|url\(\s*["']?(?:https?:)?\/\/[^)]*\)/g);
  if (bad) throw new Error(`dist/webview/main.css reaches the network: ${bad.slice(0, 3).join(" ")}`);
}

if (watch) {
  const ctxs = await Promise.all([esbuild.context(extension), esbuild.context(webview)]);
  await Promise.all(ctxs.map((c) => c.watch()));
} else {
  await Promise.all([esbuild.build(extension), esbuild.build(webview)]);
  assertNoRemoteCss();
}
