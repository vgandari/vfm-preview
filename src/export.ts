/**
 * Export: one self-contained HTML file per document, and PDF made from it.
 *
 * The HTML embeds the same webview bundle the preview uses (script and stylesheet inline, KaTeX
 * fonts as data URIs), the document text and the render options. A small shim stands in for the
 * VS Code API and hands the page its document, so the export renders exactly like the preview,
 * in either mode, with no second rendering path to keep in sync. Local images are inlined.
 *
 * PDF runs a headless Chrome/Chromium/Edge on that HTML. Slides are laid out one per 1280×720
 * page with every reveal step shown (`print: true`).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFile } from "child_process";
import { pathToFileURL } from "url";
import type { Mode, RenderOptions } from "./protocol";
import type { SourceLoc } from "../vfm/slides/types";
import type { BibEntry } from "../vfm/bibliography";

export interface ExportInput {
  /** The extension's install folder (holds dist/webview). */
  extensionPath: string;
  /** The document's file, for its folder and name. */
  file: string;
  /** Text with `@include`s expanded. */
  text: string;
  sourceMap?: SourceLoc[];
  /** Entries of the document's `bibliography:` file(s), so `@cite` resolves in the exported page. */
  bib?: Record<string, BibEntry>;
  options: RenderOptions;
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

/** Replaces `![alt](relative/path.png)` with a data URI so the HTML stands alone. */
export function inlineImages(text: string, baseDir: string): string {
  return text.replace(
    /(!\[[^\]]*\]\()\s*(<[^>]+>|[^)\s]+)((?:\s+"[^"]*")?\s*\))/g,
    (whole, open: string, target: string, close: string) => {
      const raw = target.startsWith("<") ? target.slice(1, -1) : target;
      if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(raw)) return whole;
      const mime = MIME[path.extname(raw).toLowerCase()];
      if (!mime) return whole;
      try {
        const file = path.resolve(baseDir, decodeURIComponent(raw.split("?")[0]));
        const data = fs.readFileSync(file).toString("base64");
        return `${open}data:${mime};base64,${data}${close.replace(/^\s+/, " ")}`;
      } catch {
        return whole; // missing file: leave the link, the page will show a broken image
      }
    }
  );
}

/** Inlines the woff2 fonts and drops the woff/ttf fallbacks, which every current browser can do without. */
function inlineFonts(css: string, assetsRoot: string): string {
  return css.replace(/@font-face\{[^}]*\}/g, (face) => {
    const m = /url\("?(\.\/)?([^")]+\.woff2)"?\)\s*format\("woff2"\)/.exec(face);
    if (!m) return face;
    try {
      const data = fs.readFileSync(path.join(assetsRoot, m[2])).toString("base64");
      return face.replace(/src:[^;}]*/, `src:url(data:font/woff2;base64,${data}) format("woff2")`);
    } catch {
      return face;
    }
  });
}

const escapeScript = (js: string) => js.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");

function titleOf(text: string, file: string): string {
  const m = /^---\s*\n[\s\S]*?^title:\s*(.+)$/m.exec(text.startsWith("---") ? text : "");
  const t = m?.[1]?.trim().replace(/^["']|["']$/g, "");
  return t || path.basename(file, path.extname(file));
}

export function standaloneHtml(input: ExportInput & { print: boolean }): string {
  const dist = path.join(input.extensionPath, "dist", "webview");
  const css = inlineFonts(fs.readFileSync(path.join(dist, "main.css"), "utf8"), dist);
  const js = fs.readFileSync(path.join(dist, "main.js"), "utf8");
  const dir = path.dirname(input.file);

  const update = {
    type: "update",
    text: inlineImages(input.text, dir),
    // Anything left relative (an image that could not be read) still resolves when opened from disk.
    baseUri: pathToFileURL(dir).toString() + "/",
    options: { ...input.options, theme: "vfm", print: input.print },
    sourceMap: input.sourceMap,
    bib: input.bib,
  };
  const payload = JSON.stringify(update).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, " ");
  const title = titleOf(input.text, input.file).replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"));

  // PDF is always light; a browser follows the system theme.
  const colorMode = input.print
    ? `document.body.classList.add("vscode-light");`
    : `document.body.classList.add(matchMedia("(prefers-color-scheme: dark)").matches ? "vscode-dark" : "vscode-light");`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: file:; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline'">
<title>${title}</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>
// Stands in for the VS Code webview API: when the app says it is ready, give it the document.
window.__VFM_EXPORT__ = true;
window.acquireVsCodeApi = function () {
  return { postMessage: function (m) { if (m && m.type === "ready") setTimeout(function () { window.postMessage(${payload}, "*"); }, 0); } };
};
${colorMode}
</script>
<script>${escapeScript(js)}</script>
</body>
</html>
`;
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

/** Where a Chromium-based browser lives on this machine, if anywhere. */
export function findBrowser(configured?: string): string | undefined {
  if (configured && fs.existsSync(configured)) return configured;
  const home = os.homedir();
  const candidates: string[] =
    process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
          path.join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        ]
      : process.platform === "win32"
        ? ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"].flatMap((v) => {
            const base = process.env[v];
            return base
              ? [
                  path.join(base, "Google/Chrome/Application/chrome.exe"),
                  path.join(base, "Microsoft/Edge/Application/msedge.exe"),
                  path.join(base, "BraveSoftware/Brave-Browser/Application/brave.exe"),
                ]
              : [];
          })
        : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "brave-browser"].flatMap(
            (name) => (process.env.PATH ?? "").split(path.delimiter).map((d) => path.join(d, name))
          );
  return candidates.find((c) => fs.existsSync(c));
}

export function printToPdf(browser: string, html: string, outFile: string): Promise<void> {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "vfm-pdf-"));
  const page = path.join(work, "export.html");
  fs.writeFileSync(page, html);
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-pdf-header-footer",
    "--allow-file-access-from-files",
    // A private profile, so this never attaches to (and exits with) a browser that is already open.
    `--user-data-dir=${path.join(work, "profile")}`,
    // The page builds its slides with timers and async image loads; let virtual time run them out.
    "--virtual-time-budget=30000",
    `--print-to-pdf=${outFile}`,
    pathToFileURL(page).toString(),
  ];
  return new Promise((resolve, reject) => {
    execFile(browser, args, { timeout: 180_000 }, (err, _out, stderr) => {
      fs.rmSync(work, { recursive: true, force: true });
      if (err) reject(new Error(`${path.basename(browser)} failed: ${stderr?.toString().split("\n").find((l) => /error/i.test(l)) ?? err.message}`));
      else if (!fs.existsSync(outFile)) reject(new Error("The browser finished without writing a PDF."));
      else resolve();
    });
  });
}

/** A file in the temp folder for opening in a browser. */
export function writeTemp(file: string, mode: Mode, html: string): string {
  const dir = path.join(os.tmpdir(), "vfm-preview");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${path.basename(file, path.extname(file))}-${mode}.html`);
  fs.writeFileSync(out, html);
  return out;
}
