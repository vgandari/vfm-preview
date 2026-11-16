import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
// pseudocode.min.css @imports KaTeX's CSS from a CDN; vfm ships it without that line.
import "@vfm/pseudocode.css";
import "./theme.css";
import "@vfm/slides/slides.css";
import "./slides.css";
import styles from "@vfm/CustomMarkdown.module.css";
import { renderMarkdown, collectRegistry } from "@vfm/pipeline";
import { SlideDirectiveError, type Diagnostic } from "@vfm/slides";
import Frontmatter from "./Frontmatter";
import Slides, { ProblemList } from "./Slides";
import type { HostMessage, UpdateMessage, WebviewMessage } from "../protocol";
import { exportDocument } from "./exports";
import { bibliographyFor } from "./bib";
import { anchors, expandedLine, lineForTop, lineOwner, locOf, mainLine, topForLine, type SourceMap } from "./interact";

declare function acquireVsCodeApi(): { postMessage(msg: WebviewMessage): void };
const vscode = acquireVsCodeApi();

// vfm picks light/dark with prefers-color-scheme, which in a webview follows the OS,
// not the VS Code theme. vfm also honors an explicit data-theme on <html>, so set it
// from the theme kind VS Code puts on <body>.
function syncColorMode() {
  const dark = document.body.classList.contains("vscode-dark") || document.body.classList.contains("vscode-high-contrast");
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
syncColorMode();
new MutationObserver(syncColorMode).observe(document.body, { attributes: true, attributeFilter: ["class"] });

type State = UpdateMessage;

function post(msg: WebviewMessage) {
  vscode.postMessage(msg);
}

/** While set, scroll events are echoes of a programmatic scroll and are not sent back. */
let quietUntil = 0;
const quiet = (ms = 250) => void (quietUntil = Date.now() + ms);

/** Document mode: the preview follows the editor's scroll position and the editor follows the preview's. */
function useScrollSync(bodyRef: React.RefObject<HTMLDivElement | null>, sourceMap: SourceMap, rendered: unknown) {
  const map = useRef(sourceMap);
  map.current = sourceMap;
  useEffect(() => {
    const onMessage = (e: MessageEvent<HostMessage>) => {
      if (e.data.type !== "scroll" || !bodyRef.current) return;
      const line = expandedLine(e.data.line, map.current);
      const top = topForLine(anchors(bodyRef.current), line);
      if (top === undefined) return;
      quiet();
      window.scrollTo({ top: Math.max(0, top - 4) });
    };
    let frame = 0;
    let last = -1;
    const onScroll = () => {
      if (Date.now() < quietUntil || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!bodyRef.current) return;
        const expanded = lineForTop(anchors(bodyRef.current), window.scrollY + 4);
        const line = expanded === undefined ? undefined : mainLine(expanded, map.current);
        if (line === undefined || Math.floor(line) === last) return;
        last = Math.floor(line);
        post({ type: "scrollEditor", line: Math.max(1, Math.floor(line)) });
      });
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [bodyRef, rendered]);
}

function DocumentView({ state }: { state: State }) {
  const { text, baseUri, options, sourceMap, bib } = state;
  const bodyRef = useRef<HTMLDivElement>(null);

  // Document mode renders everything; @slide wrappers are transparent. Fatal directive
  // errors (bad syntax, unknown labels) come back as a list instead of a half-render.
  const { rendered, problems } = useMemo(() => {
    try {
      const opts = { numberingDepth: options.numberingDepth, numberCaptions: options.numberCaptions, headingShift: 0, id: null, sourceMap, bibliography: bibliographyFor(text, bib) };
      const registry = collectRegistry(text, opts);
      return { rendered: renderMarkdown(text, opts, registry), problems: [] as Diagnostic[] };
    } catch (err) {
      if (err instanceof SlideDirectiveError) {
        return { rendered: <ProblemList items={err.diagnostics} title="Cannot render this document" />, problems: err.diagnostics };
      }
      return { rendered: <pre className="vfm-error">{String((err as Error)?.stack ?? err)}</pre>, problems: [] as Diagnostic[] };
    }
  }, [text, options.numberingDepth, options.numberCaptions, sourceMap, bib]);

  useEffect(() => {
    post({ type: "diagnostics", items: problems });
  }, [problems]);

  // Point relative image URLs at the document's folder.
  useLayoutEffect(() => {
    const base = baseUri.endsWith("/") ? baseUri : baseUri + "/";
    bodyRef.current?.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src");
      if (src && !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)) {
        img.setAttribute("src", new URL(src, base).toString());
      }
    });
  }, [rendered, baseUri]);

  useScrollSync(bodyRef, sourceMap, rendered);

  return (
    <div className="vfm-page" style={{ maxWidth: options.maxWidth > 0 ? options.maxWidth : "none" }}>
      <div ref={bodyRef} className={`${styles.markdownBody} vfm-body`}>
        <Frontmatter text={text} />
        {rendered}
      </div>
    </div>
  );
}

function Preview({ state }: { state: State }) {
  const { options } = state;
  useLayoutEffect(() => {
    document.documentElement.dataset.vfmTheme = options.theme;
  }, [options.theme]);
  const onDiagnostics = useCallback((items: Diagnostic[]) => post({ type: "diagnostics", items }), []);

  return (
    <>
      {options.mode === "slides" ? (
        <Slides
          text={state.text}
          baseUri={state.baseUri}
          sourceMap={state.sourceMap}
          bib={state.bib}
          maxHeadings={options.maxHeadings}
          print={options.print}
          onDiagnostics={onDiagnostics}
        />
      ) : (
        <DocumentView state={state} />
      )}
    </>
  );
}

function App() {
  const [state, setState] = useState<State | null>(null);
  const latest = useRef<State | null>(null);
  latest.current = state;

  useEffect(() => {
    const onMessage = (e: MessageEvent<HostMessage>) => {
      if (e.data.type === "update") {
        // Keep scroll position across re-renders.
        const y = window.scrollY;
        quiet(400);
        setState(e.data);
        requestAnimationFrame(() => window.scrollTo(0, y));
      } else if (e.data.type === "export") {
        const cur = latest.current;
        if (!cur) return post({ type: "exported", format: e.data.format, error: "The preview has not loaded yet." });
        const { format, template } = e.data;
        exportDocument(format, e.data.text === undefined ? cur : { ...cur, text: e.data.text }, template).then(
          (data) => post({ type: "exported", format, data }),
          (err) => post({ type: "exported", format, error: String((err as Error)?.message ?? err) })
        );
      }
    };
    // A task checkbox toggles the line it came from; the host edits the file and the preview follows.
    const onTaskClick = (e: MouseEvent) => {
      const box = e.target as HTMLInputElement;
      if (!box.matches?.('input[type="checkbox"]') || (window as any).__VFM_EXPORT__) return false;
      const li = box.closest("li[data-line]") as HTMLElement | null;
      if (!li) return false;
      e.preventDefault(); // the re-render after the edit shows the new state
      post({ type: "toggleTask", loc: locOf(Number(li.dataset.line), latest.current?.sourceMap) });
      return true;
    };
    const onDblClick = (e: MouseEvent) => {
      const el = lineOwner(e.target as Element);
      if (!el) return;
      const word = window.getSelection()?.toString().trim();
      post({
        type: "reveal",
        loc: locOf(Number(el.dataset.line), latest.current?.sourceMap),
        word: word && word.length < 80 && !/\n/.test(word) ? word : undefined,
      });
    };
    const onClick = (e: MouseEvent) => {
      if (onTaskClick(e)) return;
      const a = (e.target as Element).closest?.("a");
      const href = a?.getAttribute("href");
      if (!a || !href) return;
      if (href.startsWith("#")) {
        e.preventDefault();
        document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView();
      } else if (!/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) {
        e.preventDefault();
        vscode.postMessage({ type: "openLink", href });
      }
    };
    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick);
    document.addEventListener("dblclick", onDblClick);
    vscode.postMessage({ type: "ready" });
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick);
      document.removeEventListener("dblclick", onDblClick);
    };
  }, []);

  return state ? <Preview state={state} /> : null;
}

createRoot(document.getElementById("root")!).render(<App />);
