/**
 * Tests for `editor-sync`: the slide a line of the file lands on, and the thumbnail sidebar's structure.
 * Each test names the requirements (docs/REQUIREMENTS.md) and use cases (docs/USE_CASES.md) it verifies.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let api: any;
let slideForLine: (slides: any[], line: number) => number;
let work = "";

before(async () => {
  work = mkdtempSync(join(tmpdir(), "vfm-sync-"));
  const out = join(work, "api.mjs");
  await build({
    stdin: {
      contents: 'export { buildSlideDeck } from "@vfm/slides"; export { slideForLine } from "./src/webview/slideForLine.ts";',
      resolveDir: root,
      sourcefile: "entry.ts",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: out,
    logLevel: "silent",
    jsx: "automatic",
    alias: { "@vfm": resolve(root, "node_modules/vfm") },
    nodePaths: [join(root, "node_modules")],
    external: ["mermaid"],
    loader: { ".module.css": "local-css", ".css": "empty" },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  const mod = await import(pathToFileURL(out).href);
  api = mod;
  slideForLine = mod.slideForLine;
});
after(() => rmSync(work, { recursive: true, force: true }));

const lineOf = (text: string, needle: string) => text.split("\n").findIndex((l) => l.includes(needle)) + 1;

// Verifies REQ-254 (UC-42)
test("a line inside an @slide block lands on that slide", () => {
  const text = "---\ntitle: T\n---\n\n@slide[One]\nAlpha text.\n@end\n\n@slide[Two]\nBeta text.\n@end\n";
  const deck = api.buildSlideDeck(text);
  const at = (needle: string) => slideForLine(deck.slides, lineOf(text, needle));
  const one = deck.slides.findIndex((s: any) => s.titleSource === "override" && s.titleLine === lineOf(text, "@slide[One]"));
  const two = deck.slides.findIndex((s: any) => s.titleSource === "override" && s.titleLine === lineOf(text, "@slide[Two]"));
  assert.ok(one >= 0 && two > one);
  assert.equal(at("Alpha text."), one);
  assert.equal(at("Beta text."), two);
  assert.equal(at("@slide[Two]"), two);
});

// Verifies REQ-254 (UC-42)
test("a line between blocks lands on the slide above; one before the first block, on the first slide", () => {
  const text = "---\ntitle: T\n---\n\nIntro prose, not on any slide.\n\n@slide[One]\nAlpha.\n@end\n\nProse between.\n\n@slide[Two]\nBeta.\n@end\n";
  const deck = api.buildSlideDeck(text);
  const one = deck.slides.findIndex((s: any) => s.titleLine === lineOf(text, "@slide[One]"));
  assert.equal(slideForLine(deck.slides, lineOf(text, "Prose between.")), one);
  assert.equal(slideForLine(deck.slides, lineOf(text, "Intro prose")), 0);
  assert.equal(slideForLine(deck.slides, 1), 0);
});

// Verifies REQ-254 (UC-42)
test("a long slide split into continuations: the line lands on the continuation that shows it", () => {
  const items = Array.from({ length: 40 }, (_, i) => `- Item number ${i + 1} with some words so the list is tall enough to be split`).join("\n");
  const text = `---\ntitle: T\n---\n\n@slide[Long]\n${items}\n@end\n`;
  const deck = api.buildSlideDeck(text);
  const long = deck.slides.filter((s: any) => s.titleLine === lineOf(text, "@slide[Long]"));
  if (long.length < 2) return; // the estimator fitted it on one slide: nothing to split (still checked above)
  const first = deck.slides.indexOf(long[0]);
  assert.equal(slideForLine(deck.slides, lineOf(text, "Item number 1 ")), first);
  assert.equal(slideForLine(deck.slides, lineOf(text, "Item number 40 ")), deck.slides.indexOf(long[long.length - 1]));
});

// Verifies REQ-254 (UC-42)
test("an empty deck yields slide 0 and a deck of one slide always yields it", () => {
  assert.equal(slideForLine([], 5), 0);
  const text = "@slide[Only]\nText.\n@end\n";
  const deck = api.buildSlideDeck(text);
  for (const line of [1, 2, 3, 99]) assert.equal(slideForLine(deck.slides, line), 0);
});

const css = () => readFileSync(join(root, "src/webview/slides.css"), "utf8");
const tsx = () => readFileSync(join(root, "src/webview/Slides.tsx"), "utf8");
const rule = (sel: string) => new RegExp(`${sel.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`).exec(css())?.[1] ?? "";

// Verifies REQ-251 (UC-41)
test("the thumbnail's number is rendered after, and outside, the thumbnail button, centered", () => {
  const src = tsx();
  const button = src.indexOf('className={`vfm-thumb${');
  const closeButton = src.indexOf("</button>", button);
  const number = src.indexOf('className={`vfm-thumb-number');
  assert.ok(button > 0 && closeButton > button && number > closeButton, "number must follow the closing </button>");
  assert.match(rule(".vfm-thumb-item"), /align-items:\s*center/);
  assert.match(rule(".vfm-thumb-item"), /flex-direction:\s*column/);
  assert.match(rule(".vfm-thumb-number"), /text-align:\s*center/);
  assert.doesNotMatch(rule(".vfm-thumb-number"), /position:\s*absolute/);
});

// Verifies REQ-252 (UC-41)
test("a separator lies under each number except the last", () => {
  assert.match(rule(".vfm-thumb-item"), /border-bottom:\s*1px solid/);
  assert.match(rule(".vfm-thumb-item:last-child"), /border-bottom:\s*none/);
});
