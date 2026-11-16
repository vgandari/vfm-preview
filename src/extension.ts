import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { expandIncludes } from "@vfm/slides/includes";
import type { Diagnostic, SourceLoc } from "@vfm/slides/types";
import type { ExportFormat, HostMessage, Mode, RenderOptions, WebviewMessage } from "./protocol";
import { findBrowser, inlineImages, printToPdf, standaloneHtml, writeTemp } from "./export";
import { parse as parseYaml } from "yaml";
import { loadBibliography } from "./bibliography";

const VIEW_TYPE = "vfmPreview";
const MODE_KEY = "vfmPreview.mode";

const diagnostics = vscode.languages.createDiagnosticCollection("vfmPreview");

const SEVERITY: Record<Diagnostic["severity"], vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Hint,
};

function setModeContext(mode: Mode | undefined) {
  void vscode.commands.executeCommand("setContext", MODE_KEY, mode ?? "");
}

/** The document's text with `@include`s expanded, and the files it pulled in. */
async function loadSource(
  uri: vscode.Uri
): Promise<{ text: string; sourceMap?: SourceLoc[]; diagnostics: Diagnostic[]; included: Set<string> } | undefined> {
  let text: string;
  try {
    text = (await vscode.workspace.openTextDocument(uri)).getText();
  } catch {
    return undefined; // file deleted or unreadable
  }
  const included = new Set<string>();
  if (!text.includes("@include(")) return { text, diagnostics: [], included };
  const expanded = expandIncludes(text, {
    file: uri.fsPath,
    resolve: (from, relative) => path.resolve(path.dirname(from), relative),
    read: (file) => {
      included.add(file);
      const open = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === file);
      if (open) return open.getText();
      try {
        return fs.readFileSync(file, "utf8");
      } catch {
        return null;
      }
    },
  });
  return { text: expanded.text, sourceMap: expanded.lineMap, diagnostics: expanded.diagnostics, included };
}

function renderOptions(mode: Mode): RenderOptions {
  const cfg = vscode.workspace.getConfiguration("vfmPreview");
  return {
    numberingDepth: cfg.get<number>("numberingDepth", 1),
    numberCaptions: cfg.get<"all" | "referenced">("numberCaptions", "referenced"),
    maxWidth: cfg.get<number>("maxWidth", 860),
    theme: cfg.get<"vfm" | "vscode">("theme", "vfm"),
    mode,
    maxHeadings: cfg.get<number>("maxHeadingsPerSlide", 2),
  };
}

class PreviewPanel {
  private static readonly panels = new Map<string, PreviewPanel>();
  private static active: PreviewPanel | undefined;

  /** Current view of this preview. */
  mode: Mode;
  /** Files pulled in by `@include`, so edits to them refresh the preview. */
  private included = new Set<string>();
  /** Include problems found by the host, merged with the webview's report. */
  private hostDiagnostics: Diagnostic[] = [];
  private webviewDiagnostics: Diagnostic[] = [];

  private readonly disposables: vscode.Disposable[] = [];
  private ready = false;
  private onReady: Array<() => void> = [];
  private timer: NodeJS.Timeout | undefined;
  /** Editor and preview scroll each other; this keeps a scroll we caused from echoing back. */
  private quietUntil = 0;
  private exportWaiter: ((m: Extract<WebviewMessage, { type: "exported" }>) => void) | undefined;

  static show(context: vscode.ExtensionContext, uri: vscode.Uri, column: vscode.ViewColumn) {
    const existing = PreviewPanel.panels.get(uri.toString());
    if (existing) {
      existing.panel.reveal(column);
      return existing;
    }
    const folders = [
      vscode.Uri.joinPath(context.extensionUri, "dist"),
      vscode.Uri.file(path.dirname(uri.fsPath)),
      ...(vscode.workspace.workspaceFolders?.map((f) => f.uri) ?? []),
    ];
    const initial = vscode.workspace.getConfiguration("vfmPreview").get<Mode>("mode", "document");
    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      PreviewPanel.titleFor(initial, uri),
      { viewColumn: column, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: folders }
    );
    const created = new PreviewPanel(context, panel, uri, initial);
    PreviewPanel.panels.set(uri.toString(), created);
    return created;
  }

  private static titleFor(mode: Mode, uri: vscode.Uri) {
    return `${mode === "slides" ? "Slides" : "Preview"} ${path.basename(uri.fsPath)}`;
  }

  /** The preview a command applies to: the focused one, else the one for the active Markdown editor. */
  static current(): PreviewPanel | undefined {
    if (PreviewPanel.active?.panel.active) return PreviewPanel.active;
    const doc = vscode.window.activeTextEditor?.document;
    return doc ? PreviewPanel.panels.get(doc.uri.toString()) : PreviewPanel.active;
  }

  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.panel.title = PreviewPanel.titleFor(mode, this.uri);
    if (PreviewPanel.active === this) setModeContext(mode);
    void this.update();
  }

  toggleMode() {
    this.setMode(this.mode === "slides" ? "document" : "slides");
  }

  static refreshAll() {
    for (const p of PreviewPanel.panels.values()) p.scheduleUpdate();
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    readonly uri: vscode.Uri,
    mode: Mode
  ) {
    this.mode = mode;
    panel.webview.html = this.html();

    panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => {
        if (msg.type === "ready") {
          this.ready = true;
          this.onReady.splice(0).forEach((f) => f());
          void this.update();
        } else if (msg.type === "reveal") {
          void this.reveal(msg.loc, msg.word);
        } else if (msg.type === "toggleTask") {
          void this.toggleTask(msg.loc);
        } else if (msg.type === "scrollEditor") {
          this.scrollEditor(msg.line);
        } else if (msg.type === "exported") {
          this.exportWaiter?.(msg);
        } else if (msg.type === "openLink") {
          void this.openLink(msg.href);
        } else if (msg.type === "diagnostics") {
          this.webviewDiagnostics = msg.items;
          this.publishDiagnostics();
        }
      },
      null,
      this.disposables
    );

    vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() === uri.toString() || this.included.has(e.document.uri.fsPath)) {
          this.scheduleUpdate();
        }
      },
      null,
      this.disposables
    );
    vscode.window.onDidChangeTextEditorVisibleRanges(
      (e) => {
        if (this.mode !== "document" || e.textEditor.document.uri.toString() !== uri.toString()) return;
        if (Date.now() < this.quietUntil || e.visibleRanges.length === 0) return;
        this.quietUntil = Date.now() + 150;
        const message: HostMessage = { type: "scroll", line: e.visibleRanges[0].start.line + 1 };
        void this.panel.webview.postMessage(message);
      },
      null,
      this.disposables
    );
    panel.onDidChangeViewState(
      () => {
        if (panel.active) {
          PreviewPanel.active = this;
          setModeContext(this.mode);
        }
      },
      null,
      this.disposables
    );
    PreviewPanel.active = this;
    setModeContext(this.mode);
    panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  whenReady(): Promise<void> {
    return this.ready ? Promise.resolve() : new Promise((resolve) => this.onReady.push(resolve));
  }

  /** Double click in the preview: show that place in the editor, on the clicked word when it is on the line. */
  private async reveal(loc: { file?: string; line: number }, word?: string) {
    const file = loc.file ?? this.uri.fsPath;
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
      const line = Math.min(Math.max(0, loc.line - 1), doc.lineCount - 1);
      const text = doc.lineAt(line).text;
      const col = word ? Math.max(0, text.indexOf(word)) : text.search(/\S|$/);
      const end = word && text.includes(word) ? col + word.length : col;
      const existing = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === file);
      const editor = await vscode.window.showTextDocument(doc, {
        viewColumn: existing?.viewColumn ?? vscode.ViewColumn.One,
        selection: new vscode.Range(line, col, line, end),
        preserveFocus: false,
      });
      this.quietUntil = Date.now() + 400;
      editor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    } catch {
      void vscode.window.showWarningMessage(`Cannot open ${file}`);
    }
  }

  /** A checkbox was clicked in the preview: flip `[ ]` ↔ `[x]` on its list item line. */
  private async toggleTask(loc: { file?: string; line: number }) {
    const file = loc.file ?? this.uri.fsPath;
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
      const line = loc.line - 1;
      const m = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/.exec(doc.lineAt(line).text);
      if (!m) {
        void vscode.window.showWarningMessage(`No task checkbox found on line ${loc.line} of ${path.basename(file)}.`);
        return;
      }
      const at = m[1].length;
      const edit = new vscode.WorkspaceEdit();
      // Flip what the file says now, not what the page thinks: a controlled checkbox in the page can lag behind.
      edit.replace(doc.uri, new vscode.Range(line, at, line, at + 1), m[2] === " " ? "x" : " ");
      await vscode.workspace.applyEdit(edit);
    } catch {
      void vscode.window.showWarningMessage(`Cannot edit ${file}`);
    }
  }

  private scrollEditor(line: number) {
    if (this.mode !== "document" || Date.now() < this.quietUntil) return;
    const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === this.uri.toString());
    if (!editor) return;
    this.quietUntil = Date.now() + 300;
    const at = Math.min(Math.max(0, line - 1), editor.document.lineCount - 1);
    editor.revealRange(new vscode.Range(at, 0, at, 0), vscode.TextEditorRevealType.AtTop);
  }

  /** Asks the preview to build a file (it has the parser and renderer) and waits for it. */
  async build(format: ExportFormat, text: string, template?: string): Promise<Extract<WebviewMessage, { type: "exported" }>> {
    await this.whenReady();
    return new Promise((resolve) => {
      this.exportWaiter = (m) => {
        this.exportWaiter = undefined;
        resolve(m);
      };
      const message: HostMessage = { type: "export", format, template, text };
      void this.panel.webview.postMessage(message);
    });
  }

  private scheduleUpdate() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.update(), 150);
  }

  private async update() {
    if (!this.ready) return;
    const source = await loadSource(this.uri);
    if (!source) return; // keep showing the last render
    const bib = loadBibliography(this.uri.fsPath, source.text);
    // Editing the .bib file refreshes the preview, like an included file.
    this.included = new Set([...source.included, ...bib.files]);
    this.hostDiagnostics = [...source.diagnostics, ...bib.diagnostics];
    if (source.diagnostics.length > 0) this.publishDiagnostics();
    const baseUri = this.panel.webview
      .asWebviewUri(vscode.Uri.file(path.dirname(this.uri.fsPath)))
      .toString();
    const message: HostMessage = {
      type: "update",
      text: source.text,
      baseUri,
      options: renderOptions(this.mode),
      sourceMap: source.sourceMap,
      bib: bib.entries,
    };
    void this.panel.webview.postMessage(message);
  }

  /** Shows the host's and the webview's findings in the Problems panel, by original file. */
  private publishDiagnostics() {
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const d of [...this.hostDiagnostics, ...this.webviewDiagnostics]) {
      const file = d.loc?.file ?? this.uri.fsPath;
      const line = Math.max(0, (d.loc?.line ?? 1) - 1);
      const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
      const out = new vscode.Diagnostic(range, d.message, SEVERITY[d.severity]);
      out.code = d.code;
      out.source = "vfm";
      byFile.set(file, [...(byFile.get(file) ?? []), out]);
    }
    diagnostics.delete(this.uri);
    for (const file of this.included) diagnostics.delete(vscode.Uri.file(file));
    for (const [file, list] of byFile) diagnostics.set(vscode.Uri.file(file), list);
  }

  private async openLink(href: string) {
    // Relative links to local files open in the editor; the webview handles the rest.
    const [file, fragment] = href.split("#");
    if (!file) return;
    const target = vscode.Uri.file(path.resolve(path.dirname(this.uri.fsPath), decodeURIComponent(file)));
    try {
      await vscode.workspace.fs.stat(target);
    } catch {
      void vscode.window.showWarningMessage(`File not found: ${target.fsPath}`);
      return;
    }
    if (/\.(md|markdown)$/i.test(target.fsPath)) {
      PreviewPanel.show(this.context, target, this.panel.viewColumn ?? vscode.ViewColumn.Active);
    } else {
      void fragment;
      await vscode.commands.executeCommand("vscode.open", target);
    }
  }

  private html(): string {
    const webview = this.panel.webview;
    const dist = vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview");
    const script = webview.asWebviewUri(vscode.Uri.joinPath(dist, "main.js"));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(dist, "main.css"));
    const nonce = Array.from({ length: 24 }, () => Math.random().toString(36)[2]).join("");
    // Nothing the page runs (KaTeX, abcjs, pseudocode.js, Mermaid) may reach the network: no connect-src,
    // fonts and images only from the extension, the document's folder, or data: URIs. Remote images in the
    // Markdown are blocked unless vfmPreview.allowRemoteImages is on.
    const remote = vscode.workspace.getConfiguration("vfmPreview").get<boolean>("allowRemoteImages", false);
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:${remote ? " https:" : ""}`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource} data:`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${style}">
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }

  private dispose() {
    PreviewPanel.panels.delete(this.uri.toString());
    this.hostDiagnostics = [];
    this.webviewDiagnostics = [];
    this.publishDiagnostics();
    if (PreviewPanel.active === this) {
      PreviewPanel.active = undefined;
      setModeContext(undefined);
    }
    clearTimeout(this.timer);
    this.disposables.forEach((d) => d.dispose());
  }
}

function targetUri(arg?: vscode.Uri): vscode.Uri | undefined {
  if (arg) return arg;
  const doc = vscode.window.activeTextEditor?.document;
  if (doc?.languageId === "markdown") return doc.uri;
  void vscode.window.showInformationMessage("Open a Markdown file to preview it.");
  return undefined;
}

// ─── Export ──────────────────────────────────────────────────────────────────

/** Which Markdown file, and which view of it, an export command applies to. */
async function exportTarget(arg: vscode.Uri | undefined, ask: boolean): Promise<{ uri: vscode.Uri; mode: Mode } | undefined> {
  const panel = PreviewPanel.current();
  // From a preview's title bar VS Code passes the webview panel's own URI (scheme "webview-panel"),
  // not a file; only a real file argument (explorer or editor context menu) names the document.
  const given = arg && arg.scheme === "file" ? arg : undefined;
  const uri = given ?? panel?.uri ?? targetUri();
  if (!uri) return undefined;
  const current = panel && panel.uri.toString() === uri.toString() ? panel.mode : vscode.workspace.getConfiguration("vfmPreview").get<Mode>("mode", "document");
  if (!ask) return { uri, mode: current };
  const items: Array<vscode.QuickPickItem & { mode: Mode }> = [
    { label: "Document", description: "everything, as a page", mode: "document" },
    { label: "Slides", description: "only the @slide blocks", mode: "slides" },
  ];
  items.sort((a, b) => Number(b.mode === current) - Number(a.mode === current));
  const picked = await vscode.window.showQuickPick(items, { title: "Export as", placeHolder: `Current view: ${current}` });
  return picked ? { uri, mode: picked.mode } : undefined;
}

async function buildHtml(context: vscode.ExtensionContext, uri: vscode.Uri, mode: Mode, print: boolean): Promise<string | undefined> {
  const source = await loadSource(uri);
  if (!source) {
    void vscode.window.showErrorMessage(`Cannot read ${uri.fsPath}`);
    return undefined;
  }
  return standaloneHtml({
    extensionPath: context.extensionPath,
    file: uri.fsPath,
    text: source.text,
    sourceMap: source.sourceMap,
    bib: loadBibliography(uri.fsPath, source.text).entries,
    options: renderOptions(mode),
    print,
  });
}

async function chooseOutput(uri: vscode.Uri, mode: Mode, ext: "html" | "pdf"): Promise<vscode.Uri | undefined> {
  const base = path.basename(uri.fsPath, path.extname(uri.fsPath)) + (mode === "slides" ? "-slides" : "");
  return vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(path.dirname(uri.fsPath), `${base}.${ext}`)),
    filters: ext === "html" ? { HTML: ["html"] } : { PDF: ["pdf"] },
    title: `Export ${mode === "slides" ? "slides" : "document"} to ${ext.toUpperCase()}`,
  });
}

async function offerOpen(out: vscode.Uri) {
  const choice = await vscode.window.showInformationMessage(`Exported ${path.basename(out.fsPath)}`, "Open", "Reveal");
  if (choice === "Open") void vscode.env.openExternal(out);
  else if (choice === "Reveal") void vscode.commands.executeCommand("revealFileInOS", out);
}

async function exportHtml(context: vscode.ExtensionContext, arg?: vscode.Uri) {
  const target = await exportTarget(arg, true);
  if (!target) return;
  const out = await chooseOutput(target.uri, target.mode, "html");
  if (!out) return;
  const html = await buildHtml(context, target.uri, target.mode, false);
  if (html === undefined) return;
  fs.writeFileSync(out.fsPath, html);
  void offerOpen(out);
}

async function exportPdf(context: vscode.ExtensionContext, arg?: vscode.Uri) {
  const target = await exportTarget(arg, true);
  if (!target) return;
  const browser = findBrowser(vscode.workspace.getConfiguration("vfmPreview").get<string>("browserPath"));
  if (!browser) {
    const choice = await vscode.window.showErrorMessage(
      "PDF export needs Chrome, Chromium, Edge or Brave. None was found; set vfmPreview.browserPath to one.",
      "Open Settings"
    );
    if (choice) void vscode.commands.executeCommand("workbench.action.openSettings", "vfmPreview.browserPath");
    return;
  }
  const out = await chooseOutput(target.uri, target.mode, "pdf");
  if (!out) return;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Exporting ${path.basename(out.fsPath)}…` },
    async () => {
      try {
        const html = await buildHtml(context, target.uri, target.mode, true);
        if (html === undefined) return;
        await printToPdf(browser, html, out.fsPath);
        void offerOpen(out);
      } catch (err) {
        void vscode.window.showErrorMessage(`PDF export failed: ${(err as Error).message}`);
      }
    }
  );
}

// ─── Word, PowerPoint and slides Markdown ─────────────────────────────────────

const FORMATS: Record<ExportFormat, { ext: string; label: string; key?: string }> = {
  docx: { ext: "docx", label: "Word document", key: "docx-template" },
  pptx: { ext: "pptx", label: "PowerPoint presentation", key: "pptx-template" },
  "slides-md": { ext: "md", label: "slides Markdown" },
};

/** The `docx-template:` / `pptx-template:` file named in the YAML header, as base64. */
function readTemplate(text: string, dir: string, key: string): { data?: string; problem?: string } {
  const m = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(text);
  let named: unknown;
  try {
    named = m ? (parseYaml(m[1] ?? "") as Record<string, unknown> | null)?.[key] : undefined;
  } catch {
    return { problem: "The YAML header could not be read." };
  }
  if (typeof named !== "string" || !named.trim()) return {};
  const file = path.resolve(dir, named.trim());
  try {
    return { data: fs.readFileSync(file).toString("base64") };
  } catch {
    return { problem: `Template not found: ${file} (from ${key} in the YAML header).` };
  }
}

async function exportViaPreview(context: vscode.ExtensionContext, format: ExportFormat, arg?: vscode.Uri) {
  const spec = FORMATS[format];
  const panelNow = PreviewPanel.current();
  const given = arg && arg.scheme === "file" ? arg : undefined;
  const uri = given ?? panelNow?.uri ?? targetUri();
  if (!uri) return;
  const source = await loadSource(uri);
  if (!source) {
    void vscode.window.showErrorMessage(`Cannot read ${uri.fsPath}`);
    return;
  }
  const dir = path.dirname(uri.fsPath);
  let template: string | undefined;
  if (spec.key) {
    const t = readTemplate(source.text, dir, spec.key);
    if (t.problem) {
      void vscode.window.showErrorMessage(t.problem);
      return;
    }
    template = t.data;
  }
  const base = path.basename(uri.fsPath, path.extname(uri.fsPath));
  const out = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(dir, `${base}${format === "slides-md" ? "-slides" : ""}.${spec.ext}`)),
    filters: { [spec.label]: [spec.ext] },
    title: `Export to ${spec.label}`,
  });
  if (!out) return;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Exporting ${path.basename(out.fsPath)}…` },
    async () => {
      // The preview does the work: it already has the parser, renderer and slide builder.
      const panel = PreviewPanel.show(context, uri, vscode.ViewColumn.Beside);
      const result = await panel.build(format, format === "slides-md" ? source.text : inlineImages(source.text, dir), template);
      if (!result.data) {
        void vscode.window.showErrorMessage(`Export failed: ${result.error ?? "unknown error"}`);
        return;
      }
      fs.writeFileSync(out.fsPath, Buffer.from(result.data, "base64"));
      void offerOpen(out);
    }
  );
}

/** Opens the current view in the default browser; press F there for fullscreen slides. */
async function openInBrowser(context: vscode.ExtensionContext, arg?: vscode.Uri) {
  const target = await exportTarget(arg, false);
  if (!target) return;
  const html = await buildHtml(context, target.uri, target.mode, false);
  if (html === undefined) return;
  const file = writeTemp(target.uri.fsPath, target.mode, html);
  void vscode.env.openExternal(vscode.Uri.file(file));
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("vfmPreview.open", (arg?: vscode.Uri) => {
      const uri = targetUri(arg);
      if (uri) PreviewPanel.show(context, uri, vscode.ViewColumn.Active);
    }),
    vscode.commands.registerCommand("vfmPreview.openToSide", (arg?: vscode.Uri) => {
      const uri = targetUri(arg);
      if (uri) PreviewPanel.show(context, uri, vscode.ViewColumn.Beside);
    }),
    vscode.commands.registerCommand("vfmPreview.toggleMode", (arg?: vscode.Uri) => {
      const panel = PreviewPanel.current();
      if (panel) return panel.toggleMode();
      const uri = targetUri(arg);
      if (!uri) return;
      const opened = PreviewPanel.show(context, uri, vscode.ViewColumn.Beside);
      opened?.toggleMode();
    }),
    vscode.commands.registerCommand("vfmPreview.exportHtml", (arg?: vscode.Uri) => exportHtml(context, arg)),
    vscode.commands.registerCommand("vfmPreview.exportPdf", (arg?: vscode.Uri) => exportPdf(context, arg)),
    vscode.commands.registerCommand("vfmPreview.exportWord", (arg?: vscode.Uri) => exportViaPreview(context, "docx", arg)),
    vscode.commands.registerCommand("vfmPreview.exportPowerPoint", (arg?: vscode.Uri) => exportViaPreview(context, "pptx", arg)),
    vscode.commands.registerCommand("vfmPreview.exportSlidesMarkdown", (arg?: vscode.Uri) => exportViaPreview(context, "slides-md", arg)),
    vscode.commands.registerCommand("vfmPreview.openInBrowser", (arg?: vscode.Uri) => openInBrowser(context, arg)),
    vscode.commands.registerCommand("vfmPreview.showSlides", () => PreviewPanel.current()?.setMode("slides")),
    vscode.commands.registerCommand("vfmPreview.showDocument", () => PreviewPanel.current()?.setMode("document")),
    diagnostics,
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("vfmPreview")) PreviewPanel.refreshAll();
    })
  );
}

export function deactivate() {}
