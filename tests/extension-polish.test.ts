/**
 * Extension-side tests for the `slide-polish` feature. Each test names the requirements (docs/REQUIREMENTS.md)
 * and use cases (docs/USE_CASES.md) it verifies. Run: npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import JSZip from "jszip";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, truncateSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inlineImages, MAX_INLINE_VIDEO_BYTES } from "../src/export.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
let exportDocument: (format: string, state: any, template?: string) => Promise<string>;
let work = "";

before(async () => {
  work = mkdtempSync(join(tmpdir(), "vfm-polish-"));
  const out = join(work, "exports.mjs");
  await build({
    entryPoints: [join(root, "src/webview/exports.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: out,
    logLevel: "silent",
    jsx: "automatic",
    alias: { "@vfm": resolve(root, "../vfm") },
    nodePaths: [join(root, "node_modules")],
    external: ["mermaid"],
    loader: { ".module.css": "local-css", ".css": "empty" },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  ({ exportDocument } = await import(pathToFileURL(out).href));
});

after(() => rmSync(work, { recursive: true, force: true }));

const state = (text: string) => ({
  type: "update",
  text,
  baseUri: pathToFileURL(work).href + "/",
  options: { numberingDepth: 0, numberCaptions: "all", maxWidth: 900, theme: "vfm", mode: "document", maxHeadings: 2 },
});
const unzip = async (b64: string, file: string) => (await JSZip.loadAsync(b64, { base64: true })).file(file)!.async("string");

// Verifies REQ-181 (UC-21)
test("the extension reaches vfm through the @vfm alias to the sibling folder", () => {
  const ts = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8"));
  assert.deepEqual(ts.compilerOptions.paths["@vfm/*"], ["../vfm/*"]);
  const esb = readFileSync(join(root, "esbuild.mjs"), "utf8");
  assert.match(esb, /alias: \{ "@vfm": vfmDir \}/);
  assert.match(esb, /path\.resolve\(process\.env\.VFM_DIR \?\? "\.\.\/vfm"\)/);
  for (const f of ["src/bibliography.ts", "src/export.ts", "src/protocol.ts", "src/extension.ts", "src/webview/main.tsx", "src/webview/Slides.tsx"]) {
    const src = readFileSync(join(root, f), "utf8");
    assert.doesNotMatch(src, /from "(\.\.\/)+vfm\//, `${f} still imports vfm by relative path`);
  }
});

// Verifies REQ-144 (UC-17)
test("the webview and exported pages may load videos from where they may load images", () => {
  const ext = readFileSync(join(root, "src/extension.ts"), "utf8");
  assert.match(ext, /`media-src \$\{webview\.cspSource\} data:\$\{remote \? " https:" : ""\}`/);
  assert.match(readFileSync(join(root, "src/export.ts"), "utf8"), /media-src data: file:;/);
  const main = readFileSync(join(root, "src/webview/main.tsx"), "utf8");
  assert.match(main, /querySelectorAll\("img, video"\)/);
});

// Verifies REQ-145 (UC-17): the CSP admits remote media only with the same setting as remote images
test("remote videos are blocked unless remote images are allowed", () => {
  const ext = readFileSync(join(root, "src/extension.ts"), "utf8");
  const img = /`img-src [^`]*\$\{remote \? " https:" : ""\}`/.test(ext);
  const media = /`media-src [^`]*\$\{remote \? " https:" : ""\}`/.test(ext);
  assert.ok(img && media);
  assert.match(readFileSync(join(root, "package.json"), "utf8"), /images and videos from http\(s\)/);
});

// Verifies REQ-147 (UC-17)
test("the HTML export embeds a video of 50 MB or less and leaves a larger one as a link", () => {
  writeFileSync(join(work, "small.mov"), Buffer.from("not really a movie"));
  const big = join(work, "big.mov");
  writeFileSync(big, "");
  truncateSync(big, MAX_INLINE_VIDEO_BYTES + 1);
  const out = inlineImages("![Small](small.mov)\n\n![Big](big.mov)\n\n![Pic](missing.png)\n", work);
  // A .mov is typed video/mp4: Chromium may refuse video/quicktime in a data: URI.
  assert.match(out, /!\[Small\]\(data:video\/mp4;base64,[A-Za-z0-9+/=]+\)/);
  assert.match(out, /!\[Big\]\(big\.mov\)/);
  assert.match(out, /!\[Pic\]\(missing\.png\)/);
});

// Verifies REQ-135 (UC-16)
test("Word writes sub/superscripts as vertically aligned runs", async () => {
  const xml = await unzip(await exportDocument("docx", state("H_{2}O and x^{2}\n")), "word/document.xml");
  assert.match(xml, /<w:vertAlign w:val="subscript"\/><\/w:rPr><w:t xml:space="preserve">2<\/w:t>/);
  assert.match(xml, /<w:vertAlign w:val="superscript"\/><\/w:rPr><w:t xml:space="preserve">2<\/w:t>/);
});

// Verifies REQ-135 (UC-16)
test("PowerPoint sets the baseline of sub/superscript runs", async () => {
  const text = "@slide[Chem]\nH_{2}O and x^{2}.\n@end\n";
  const xml = await unzip(await exportDocument("pptx", { ...state(text), options: { ...state(text).options, mode: "slides" } }), "ppt/slides/slide1.xml");
  assert.match(xml, /baseline="-25000"[^>]*>[^]*?<a:t>2<\/a:t>/);
  assert.match(xml, /baseline="30000"[^>]*>[^]*?<a:t>2<\/a:t>/);
});

// Verifies REQ-148 (UC-17)
test("Word and PowerPoint write the caption and file name of a video", async () => {
  const docx = await unzip(await exportDocument("docx", state("![Pouring the sample](media/pour.mov)\n")), "word/document.xml");
  assert.match(docx, /\[video: Pouring the sample, pour\.mov\]/);
  const text = "@slide[V]\n![Pouring the sample](media/pour.mov)\n@end\n";
  const pptx = await unzip(await exportDocument("pptx", { ...state(text), options: { ...state(text).options, mode: "slides" } }), "ppt/slides/slide1.xml");
  assert.match(pptx, /\[video: Pouring the sample, pour\.mov\]/);
});

// Verifies REQ-122 (UC-15): in Word a formula in a caption is its source text
test("Word writes the formula of a caption as its source text", async () => {
  const xml = await unzip(await exportDocument("docx", state("![Decay $N_0e^{-t}$](none.png)\n")), "word/document.xml");
  assert.match(xml, /N_0e\^\{-t\}/);
});

// Verifies REQ-111 (UC-14): the PowerPoint title slide carries the affiliations
test("the PowerPoint title slide lists the affiliations", async () => {
  const text = "---\ntitle: T\nauthor:\n  - name: Ada\n    affiliation: Analytical Engines Ltd.\n---\n\n@slide[B]\nText.\n@end\n";
  const xml = await unzip(await exportDocument("pptx", { ...state(text), options: { ...state(text).options, mode: "slides" } }), "ppt/slides/slide1.xml");
  assert.match(xml, /Analytical Engines Ltd\./);
});
