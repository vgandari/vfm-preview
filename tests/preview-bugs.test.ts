/**
 * Tests for `preview-bugs` in the extension: the slide menu, a picture that changed on disk, the HTML export of a
 * figure whose caption holds a link, and the lines of the title area. Each test names the requirements
 * (docs/REQUIREMENTS.md) and use cases (docs/USE_CASES.md) that it verifies.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// Imported directly (not bundled) so that they count in line coverage.
import { mapImageTargets } from "../src/mapImageTargets.ts";
import { assetVersions, localAssetPaths } from "../src/assetVersions.ts";
import { versionedUrl } from "../src/versionedUrl.ts";
import { slideLabel, slideTitle } from "../src/webview/slideLabel.ts";
import { inlineImages } from "../src/export.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The preview is built against the vfm it locks; VFM_DIR builds against a checkout (see esbuild.mjs).
const vfmDir = resolve(root, process.env.VFM_DIR ?? "node_modules/vfm");
let api: any;
let front: any;
let work = "";

before(async () => {
  work = mkdtempSync(join(tmpdir(), "vfm-bugs-"));
  const bundle = async (name: string, contents: string) => {
    const out = join(work, `${name}.mjs`);
    await build({
      stdin: { contents, resolveDir: root, sourcefile: `${name}.tsx`, loader: "tsx" },
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: out,
      logLevel: "silent",
      jsx: "automatic",
      alias: { "@vfm": vfmDir },
      nodePaths: [join(root, "node_modules")],
      external: ["mermaid"],
      loader: { ".module.css": "local-css", ".css": "empty" },
      banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    });
    return import(pathToFileURL(out).href);
  };
  api = await bundle("slides", 'export { buildSlideDeck } from "@vfm/slides";');
  if (existsSync(join(vfmDir, "headerLine.ts"))) {
    front = await bundle("front", 'import { renderToStaticMarkup } from "react-dom/server"; import Frontmatter from "./src/webview/Frontmatter.tsx"; export const render = (text: string) => renderToStaticMarkup(<Frontmatter text={text} />);');
  }
});
after(() => rmSync(work, { recursive: true, force: true }));

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

// ─── The slide menu ──────────────────────────────────────────────────────────

// Verifies REQ-255 (UC-53)
test("the slide menu names the title slide, numbers every other slide, and marks the parts of a split slide", () => {
  const items = Array.from({ length: 60 }, (_, i) => `- Item number ${i + 1} with some words so the list is tall enough to be split`).join("\n");
  const text = `---\ntitle: A slideshow\n---\n\n@slide[Intro]\nWords.\n@end\n\n@slide[Topic]\n${items}\n@end\n`;
  const deck = api.buildSlideDeck(text);
  const labels = deck.slides.map((s: any, i: number) => slideLabel(s, i));
  assert.equal(labels[0], "Title: A slideshow");
  assert.equal(labels[1], "2. Intro");
  assert.ok(deck.slides.length >= 4, "the long list is split");
  assert.equal(labels[2], "3. Topic (1/" + deck.slides[2].continuation.of + ")");
  assert.equal(labels[3], "4. Topic (2/" + deck.slides[3].continuation.of + ")");
});

// Verifies REQ-255 (UC-53)
test("the menu label of a slide with no title, an inline-formatted title, and a References slide", () => {
  const text = "@slide[]\nWords.\n@end\n\n@slide[The *big* `idea`]\nWords.\n@end\n";
  const deck = api.buildSlideDeck(text);
  assert.equal(slideLabel(deck.slides[0], 0), "1. Untitled slide");
  assert.equal(slideLabel(deck.slides[1], 1), "2. The big idea");
  assert.equal(slideTitle(deck.slides[1]), "The big idea");
});

const tsx = () => readFileSync(join(root, "src/webview/Slides.tsx"), "utf8");
const css = () => readFileSync(join(root, "src/webview/slides.css"), "utf8");

// Verifies REQ-255 (UC-53)
test("the slide counter is the button that opens the menu, and a click on an entry goes to that slide", () => {
  const src = tsx();
  assert.match(src, /<SlideMenu[\s\S]*counter=\{`\$\{index \+ 1\} \/ \$\{total\}/);
  assert.match(src, /className="vfm-slides-count"[\s\S]*aria-haspopup="listbox"/);
  assert.match(src, /\{slideLabel\(sl, i\)\}/);
  assert.match(src, /onPick\(i\);\s*onToggle\(false\)/);
  assert.match(src, /e\.key === "Escape"\) onToggle\(false\)/, "Escape closes it");
  assert.match(css(), /\.vfm-slide-menu \{[^}]*position: absolute[^}]*overflow-y: auto/s);
});

// ─── A picture that changed on disk ──────────────────────────────────────────

// Verifies REQ-256 (UC-54)
test("a picture's version is the time its file last changed, and it changes when the file does", () => {
  const dir = mkdtempSync(join(work, "assets-"));
  writeFileSync(join(dir, "a.png"), png);
  mkdirSync(join(dir, "img dir"));
  writeFileSync(join(dir, "img dir", "b.png"), png);
  const text = "---\ntitle: T\ntitle-image: cover.png\n---\n\n![A](a.png)\n\n![B](<img dir/b.png>)\n\n![Remote](https://x.y/c.png)\n\n![Gone](gone.png)\n";
  writeFileSync(join(dir, "cover.png"), png);
  assert.deepEqual(localAssetPaths(text).sort(), ["a.png", "cover.png", "gone.png", "img dir/b.png"]);
  const before = assetVersions(text, dir);
  assert.deepEqual(Object.keys(before).sort(), ["a.png", "cover.png", "img dir/b.png"], "a missing file has no version");
  assert.deepEqual(assetVersions(text, dir), before, "nothing changed, so nothing is new");
  utimesSync(join(dir, "a.png"), new Date(), new Date(Date.now() + 5000));
  const after = assetVersions(text, dir);
  assert.notEqual(after["a.png"], before["a.png"]);
  assert.equal(after["cover.png"], before["cover.png"], "a picture that did not change keeps its version");
});

// Verifies REQ-256 (UC-54)
test("a versioned URL is the URL with the time added, found by the path as written or percent-encoded", () => {
  const v = { "a.png": 111, "img dir/b.png": 222 };
  assert.equal(versionedUrl("https://h/doc/a.png", "a.png", v), "https://h/doc/a.png?vfm=111");
  assert.equal(versionedUrl("https://h/doc/a.png?x=1", "a.png", v), "https://h/doc/a.png?x=1&vfm=111");
  assert.equal(versionedUrl("https://h/doc/img%20dir/b.png", "img%20dir/b.png", v), "https://h/doc/img%20dir/b.png?vfm=222");
  assert.equal(versionedUrl("https://h/doc/other.png", "other.png", v), "https://h/doc/other.png");
  assert.equal(versionedUrl("https://h/doc/a.png", "a.png", undefined), "https://h/doc/a.png");
  assert.equal(versionedUrl("https://h/doc/100%.png", "100%.png", v), "https://h/doc/100%.png", "a lone percent sign is not an escape");
});

const web = () => readFileSync(join(root, "src/webview/main.tsx"), "utf8");
const ext = () => readFileSync(join(root, "src/extension.ts"), "utf8");

// Verifies REQ-256 (UC-54)
test("the document view and the slide view both put the version on a local picture, and nothing watches the files", () => {
  assert.match(web(), /versionedUrl\(new URL\(written, base\)\.toString\(\), written, assets\)/);
  assert.match(web(), /\[rendered, baseUri, assets\]/, "a new version re-points the pictures even when the text is the same");
  assert.match(tsx(), /versionedUrl\(new URL\(url, base\)\.toString\(\), url, assets\)/);
  assert.match(ext(), /assets,\n\s*\};/, "every update carries the versions");
  assert.doesNotMatch(ext() + web() + tsx(), /watchFile|createFileSystemWatcher|fs\.watch/, "no file watcher");
  assert.match(ext(), /onDidChangeWindowState[\s\S]*refreshAssetsAll/, "coming back to VS Code looks at the files again");
});

// ─── HTML export of a figure whose caption has a link ────────────────────────

// Verifies REQ-257 (UC-56)
test("mapImageTargets reads an alt text that holds brackets and links", () => {
  const seen: string[] = [];
  const out = mapImageTargets(
    "![[text](https://x.y)](a.png)\n\n![plain](b.png \"t\")\n\n![nested ![in](c.png) out](d.png)\n\n![<angle>](<e f.png>)\n\n[not an image](g.png)\n\n![never closed](h.png\n\n![](i.png)",
    (target) => {
      seen.push(target);
      return `X(${target})`;
    }
  );
  assert.deepEqual(seen, ["a.png", "b.png", "d.png", "e f.png", "i.png"] /* an image inside an alt text is only text */);
  assert.match(out, /!\[\[text\]\(https:\/\/x\.y\)\]\(X\(a\.png\)\)/);
  assert.match(out, /!\[plain\]\(X\(b\.png\) "t"\)/);
  assert.match(out, /\(X\(e f\.png\)\)/);
  assert.match(out, /\[not an image\]\(g\.png\)/);
});

// Verifies REQ-257 (UC-56)
test("the HTML export embeds a picture whose caption holds a link", () => {
  const dir = mkdtempSync(join(work, "export-"));
  writeFileSync(join(dir, "fig.png"), png);
  const out = inlineImages("![[A source](https://x.y/z)](fig.png)\n\n![Cap with [one](a) and [two](b)](fig.png){#fig:a}\n", dir);
  assert.equal((out.match(/\(data:image\/png;base64,/g) ?? []).length, 2);
  assert.doesNotMatch(out, /\]\(fig\.png\)/);
  assert.match(out, /!\[\[A source\]\(https:\/\/x\.y\/z\)\]\(data:image\/png/);
});

// Verifies REQ-257 (UC-56)
test("the HTML export embeds a TIFF picture instead of leaving a relative path the browser cannot find", () => {
  const dir = mkdtempSync(join(work, "export-"));
  writeFileSync(join(dir, "file.tif"), png);
  const out = inlineImages("![](./file.tif)\n", dir);
  assert.match(out, /\(data:image\/tiff;base64,/);
});

// ─── The title area ──────────────────────────────────────────────────────────

// Verifies REQ-258 (UC-57)
test("each part of the document's title area carries the line of the YAML key it came from", (ctx) => {
  if (!front) return ctx.skip("the locked vfm predates headerKeyLine; build against a checkout with VFM_DIR");
  const html = front.render("---\ntitle: My paper\nsubtitle: A subtitle\nauthor:\n  - name: Ann\ndate: 2026\nabstract: Short.\n---\n\nBody\n");
  assert.match(html, /<header class="vfm-frontmatter" data-line="1">/);
  assert.match(html, /<h1 data-line="2">My paper/);
  assert.match(html, /vfm-subtitle" data-line="3"/);
  assert.match(html, /vfm-authors" data-line="4"/);
  assert.match(html, /vfm-date" data-line="6"/);
  assert.match(html, /vfm-abstract" data-line="7"/);
});
