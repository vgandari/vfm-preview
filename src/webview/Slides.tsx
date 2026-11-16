import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  buildSlideDeck,
  renderSlide,
  renderNotes,
  estimateFits,
  SlideDirectiveError,
  type Diagnostic,
  type Measurer,
  type SlideDeck,
  type SourceLoc,
} from "@vfm/slides";
import styles from "@vfm/CustomMarkdown.module.css";
import { slideFits } from "./fit";
import { bibliographyFor } from "./bib";
import type { BibEntry } from "@vfm/bibliography";

const STAGE_W = 1280;
const STAGE_H = 720;

/** Every slide renders inside vfm's markdown body so its typography and color tokens apply. */
const stageClass = `${styles.markdownBody} vfm-body vfm-stage-wrap`;

// The presenter view is a second window of the same page (exports opened in a browser only; a
// VS Code webview cannot open windows). It builds its own copy of the deck and the two windows
// pass the current slide and step to each other with postMessage.
const isPresenter = typeof location !== "undefined" && location.hash === "#presenter";
// Exported HTML (and Open in Browser) is standalone: no thumbnail sidebar there, only in the VS Code preview.
const inExport = typeof window !== "undefined" && !!(window as any).__VFM_EXPORT__;
const canPresent = typeof window !== "undefined" && !!(window as any).__VFM_EXPORT__ && !isPresenter;
const PRESENTER_FEATURES = "popup,width=1200,height=760";

// ─── Fit measurement ─────────────────────────────────────────────────────────
// Candidates are rendered into an off-screen stage of the real slide size and
// tested for overflow, so what the splitter decides is what the audience sees.

let measureStage: { host: HTMLDivElement; root: ReturnType<typeof createRoot> } | null = null;

function getMeasureStage() {
  if (!measureStage) {
    const host = document.createElement("div");
    host.className = stageClass;
    host.setAttribute("aria-hidden", "true");
    Object.assign(host.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: `${STAGE_W}px`,
      height: `${STAGE_H}px`,
      visibility: "hidden",
      pointerEvents: "none",
      background: "transparent",
    });
    document.body.appendChild(host);
    measureStage = { host, root: createRoot(host) };
  }
  return measureStage;
}

const domMeasurer: Measurer = (slide, render) => {
  const { host, root } = getMeasureStage();
  flushSync(() => root.render(render()));
  // Title, lead-in and references are fixed-size, so a full slide shows up as an overflowing region.
  return slideFits(host, slide.layout === "2col");
};

// ─── Images ──────────────────────────────────────────────────────────────────
// Their height is unknown until loaded, so load them before measuring anything.

function preload(urls: string[]): Promise<void> {
  const one = (url: string) =>
    new Promise<void>((resolve) => {
      const img = new Image();
      const done = () => resolve();
      img.onload = done;
      img.onerror = done;
      img.src = url;
      setTimeout(done, 4000);
    });
  return Promise.all(urls.map(one)).then(() => undefined);
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface SlidesProps {
  text: string;
  baseUri: string;
  sourceMap?: SourceLoc[];
  bib?: Record<string, BibEntry>;
  maxHeadings: number;
  /** Lay every slide out one per page, with every step shown, instead of the viewer (PDF export). */
  print?: boolean;
  onDiagnostics: (items: Diagnostic[]) => void;
}

type Built = { deck: SlideDeck } | { error: Diagnostic[] };

function resolver(baseUri: string) {
  const base = baseUri.endsWith("/") ? baseUri : baseUri + "/";
  return (url: string) => (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url) ? url : new URL(url, base).toString());
}

export default function Slides({ text, baseUri, sourceMap, bib, maxHeadings, print, onDiagnostics }: SlidesProps) {
  const [built, setBuilt] = useState<Built | null>(null);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [showProblems, setShowProblems] = useState(false);
  const [scale, setScale] = useState(1);
  const frame = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const printRoot = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  // The thumbnail sidebar: open by default, remembered between sessions where storage allows.
  const [showThumbs, setShowThumbs] = useState(() => {
    try {
      return localStorage.getItem("vfm.thumbs") !== "0";
    } catch {
      return true;
    }
  });
  const toggleThumbs = useCallback(() => {
    setShowThumbs((v) => {
      try {
        localStorage.setItem("vfm.thumbs", v ? "0" : "1");
      } catch {
        /* storage may be unavailable; the choice then lasts for this session */
      }
      return !v;
    });
  }, []);
  const presenterWin = useRef<Window | null>(null);
  // Fullscreen on a screen that is not 16:9 leaves bands; paint them the slide's own color.
  const [fillColor, setFillColor] = useState<string | undefined>();

  // Build (asynchronously: images first). A rebuild keeps showing the old deck.
  useEffect(() => {
    let cancelled = false;
    const resolveUrl = resolver(baseUri);
    const options = { sourceMap, maxHeadings, resolveUrl, bibliography: bibliographyFor(text, bib) };
    (async () => {
      try {
        // Pass 1 with the estimator finds the images and any fatal errors cheaply.
        const rough = buildSlideDeck(text, { ...options, measure: estimateFits });
        await preload(rough.imageUrls);
        await document.fonts?.ready;
        if (cancelled) return;
        const deck = buildSlideDeck(text, { ...options, measure: domMeasurer });
        if (!cancelled) setBuilt({ deck });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof SlideDirectiveError) setBuilt({ error: err.diagnostics });
        else setBuilt({ error: [{ code: "syntax", severity: "error", message: String((err as Error)?.stack ?? err) }] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [text, baseUri, sourceMap, bib, maxHeadings]);

  const deck = built && "deck" in built ? built.deck : null;
  const total = deck?.slides.length ?? 0;

  useEffect(() => {
    if (!built) return;
    onDiagnostics("deck" in built ? built.deck.diagnostics : built.error);
  }, [built, onDiagnostics]);

  // Keep the position when the deck changes underneath us.
  useEffect(() => {
    if (index >= total && total > 0) {
      setIndex(total - 1);
      setStep(0);
    }
  }, [total, index]);

  const slide = deck?.slides[index];
  const lastStep = slide ? slide.steps.length - 1 : 0;

  const go = useCallback(
    (delta: 1 | -1) => {
      if (!deck) return;
      if (delta === 1) {
        if (step < lastStep) setStep(step + 1);
        else if (index < total - 1) {
          setIndex(index + 1);
          setStep(0);
        }
      } else if (step > 0) {
        setStep(step - 1);
      } else if (index > 0) {
        const prev = deck.slides[index - 1];
        setIndex(index - 1);
        setStep(prev.steps.length - 1);
      }
    },
    [deck, index, step, lastStep, total]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
          e.preventDefault();
          go(1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          go(-1);
          break;
        case "Home":
          setIndex(0);
          setStep(0);
          break;
        case "End":
          if (total > 0) {
            setIndex(total - 1);
            setStep(0);
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, total]);

  // Scale the 1280 × 720 stage to the window. The frame only exists once there are slides to show,
  // so this must re-run when that changes (an effect with no deps ran once, before the frame
  // existed, and the scale stayed at 1: slides overflowed narrow panels and never filled fullscreen).
  const viewing = total > 0 && !print;
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => {
      // Room for the stage is the frame minus its padding, which changes in fullscreen.
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setScale(Math.max(0.05, Math.min(w / STAGE_W, h / STAGE_H)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewing]);

  // Keep the audience window and the presenter window on the same slide and step.
  const latest = useRef({ index, step });
  latest.current = { index, step };
  const otherWindow = useCallback((): Window | null => {
    if (isPresenter) return window.opener ?? null;
    return presenterWin.current && !presenterWin.current.closed ? presenterWin.current : null;
  }, []);
  useEffect(() => {
    otherWindow()?.postMessage({ vfm: "state", index, step }, "*");
  }, [index, step, otherWindow]);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d !== "object") return;
      if (d.vfm === "state") {
        setIndex(d.index);
        setStep(d.step);
      } else if (d.vfm === "hello") {
        otherWindow()?.postMessage({ vfm: "state", ...latest.current }, "*");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [otherWindow]);
  useEffect(() => {
    // A presenter window asks the audience window where it is.
    if (isPresenter && deck) window.opener?.postMessage({ vfm: "hello" }, "*");
  }, [deck]);
  const openPresenter = useCallback(() => {
    const url = location.href.replace(/#.*$/, "") + "#presenter";
    presenterWin.current = window.open(url, "vfm-presenter", PRESENTER_FEATURES);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === "n" || e.key === "N") && !isPresenter) setShowNotes((v) => !v);
      if ((e.key === "t" || e.key === "T") && !isPresenter && !inExport && !e.metaKey && !e.ctrlKey) toggleThumbs();
      if ((e.key === "p" || e.key === "P") && canPresent) openPresenter();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPresenter]);

  // Fullscreen (works in a browser; a VS Code webview may refuse it).
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  useEffect(() => {
    const slideEl = stage.current?.querySelector<HTMLElement>(".vfm-slide");
    setFillColor(fullscreen && slideEl ? getComputedStyle(slideEl).backgroundColor : undefined);
  }, [fullscreen, index, deck]);

  // A lone float that is too tall for its region is shrunk to fit, as the measurer assumed. This
  // must be a passive effect: scores and algorithms draw in their own passive effects, which run
  // before their parent's.
  useEffect(() => {
    if (stage.current) slideFits(stage.current, slide?.layout === "2col");
  });
  // A diagram that finished drawing changes its size: check the slide's fit again.
  useEffect(() => {
    const refit = () => stage.current && slideFits(stage.current, slide?.layout === "2col");
    window.addEventListener("vfm-relayout", refit);
    return () => window.removeEventListener("vfm-relayout", refit);
  }, [slide]);
  useEffect(() => {
    printRoot.current?.querySelectorAll<HTMLElement>(".vfm-print-page").forEach((page, i) => {
      slideFits(page, deck?.slides[i]?.layout === "2col");
    });
  });

  // Reveal steps: items beyond the current step keep their space but are hidden.
  useLayoutEffect(() => {
    stage.current?.querySelectorAll<HTMLElement>("[data-step]").forEach((el) => {
      el.classList.toggle("vfm-hidden", Number(el.dataset.step) > step);
    });
  });

  const element: ReactElement | null = useMemo(
    () => (deck && slide ? renderSlide(slide, deck.render, { number: slide.cover ? undefined : index + 1 }) : null),
    [deck, slide, index]
  );

  const problems = (deck?.diagnostics ?? (built && "error" in built ? built.error : [])).filter((d) => d.severity !== "info");

  if (!built) return <div className="vfm-slides-status">Building slides…</div>;

  if ("error" in built) {
    return (
      <div className="vfm-page">
        <ProblemList items={built.error} title="Slides cannot be built" />
      </div>
    );
  }

  if (total === 0) {
    // Blocks that exist but produced no slides (every unit overflowed or was dropped) are not "no blocks".
    if (problems.length > 0) {
      return (
        <div className="vfm-page">
          <ProblemList items={problems} title="Nothing to show" />
        </div>
      );
    }
    return (
      <div className="vfm-slides-status">
        No <code>@slide</code> blocks in this document. Wrap content in <code>@slide</code> … <code>@end</code>, or switch back to document mode.
      </div>
    );
  }

  if (print && deck) {
    return (
      <div ref={printRoot} className="vfm-print">
        <style>{`@page { size: ${STAGE_W}px ${STAGE_H}px; margin: 0; }`}</style>
        {deck.slides.map((s, i) => (
          <div key={i} className={`${stageClass} vfm-print-page`} style={{ width: STAGE_W, height: STAGE_H }}>
            {renderSlide(s, deck.render, { number: s.cover ? undefined : i + 1 })}
          </div>
        ))}
      </div>
    );
  }

  const notes = slide ? renderNotes(slide, deck!.render) : null;
  const notesPanel = (
    <div className={`${styles.markdownBody} vfm-body vfm-notes-panel${isPresenter ? " vfm-notes-large" : ""}`}>
      {notes ?? <p className="vfm-notes-empty">No notes for this slide.</p>}
    </div>
  );

  return (
    <div
      className={`vfm-slides${fullscreen ? " vfm-fullscreen" : ""}${isPresenter ? " vfm-presenter" : ""}`}
      style={fillColor ? { background: fillColor } : undefined}
    >
      <div className="vfm-slides-body">
        {!isPresenter && !inExport && !fullscreen && showThumbs && (
          <aside className="vfm-thumbs" aria-label="Slides">
            {deck!.slides.map((sl, i) => (
              <Thumb
                key={i}
                deck={deck!}
                index={i}
                current={i === index}
                onPick={() => {
                  setIndex(i);
                  setStep(0);
                }}
                title={sl.cover ? "Title" : inlineTitle(sl)}
              />
            ))}
          </aside>
        )}
        <div className="vfm-slides-stagecol">
          <div ref={frame} className="vfm-slides-frame">
            <div className="vfm-stage-box" style={{ width: STAGE_W * scale, height: STAGE_H * scale }}>
              <div
                ref={stage}
                className={stageClass}
                style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: "top left" }}
              >
                {element}
              </div>
            </div>
          </div>
          {!isPresenter && showNotes && !fullscreen && notesPanel}
        </div>
        {isPresenter && (
          <aside className="vfm-presenter-side">
            <div className="vfm-presenter-next">
              <div className="vfm-presenter-label">Next</div>
              <MiniStage deck={deck!} index={index + 1} />
            </div>
            <div className="vfm-presenter-notes">
              <div className="vfm-presenter-label">Notes</div>
              {notesPanel}
            </div>
            <Timer />
          </aside>
        )}
      </div>
      <div className="vfm-slides-bar">
        <button onClick={() => go(-1)} disabled={index === 0 && step === 0} title="Previous (←)">‹</button>
        <span className="vfm-slides-count">
          {index + 1} / {total}
          {lastStep > 0 ? ` · step ${step}/${lastStep}` : ""}
        </span>
        <button onClick={() => go(1)} disabled={index === total - 1 && step === lastStep} title="Next (→ or Space)">›</button>
        {!isPresenter && !inExport && !fullscreen && (
          <button className={showThumbs ? "vfm-on" : ""} onClick={toggleThumbs} title="Slide thumbnails (T)">
            ☰ Slides
          </button>
        )}
        {!isPresenter && (
          <button
            className={showNotes ? "vfm-on" : ""}
            onClick={() => setShowNotes(!showNotes)}
            title="Presenter notes (N)"
          >
            {slide && slide.notes.length > 0 ? `Notes (${slide.notes.length})` : "Notes"}
          </button>
        )}
        {canPresent && <button onClick={openPresenter} title="Open the presenter window (P)">Presenter</button>}
        {!isPresenter && document.fullscreenEnabled && (
          <button onClick={toggleFullscreen} title="Fullscreen (F)">{fullscreen ? "⤡" : "⛶"}</button>
        )}
        {problems.length > 0 && (
          <button className="vfm-slides-problems" onClick={() => setShowProblems(!showProblems)} title="Show problems">
            {problems.length} {problems.length === 1 ? "problem" : "problems"}
          </button>
        )}
      </div>
      {showProblems && (
        <div className="vfm-slides-problem-panel">
          <ProblemList items={problems} title="Problems" />
        </div>
      )}
    </div>
  );
}

/** A small, final-step rendering of a slide: the presenter's "next" preview. */
function MiniStage({ deck, index, scale = 0.3 }: { deck: SlideDeck; index: number; scale?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const slide = deck.slides[index];
  const s = scale;
  useEffect(() => {
    if (ref.current) slideFits(ref.current, slide?.layout === "2col");
  });
  if (!slide) return <div className="vfm-mini vfm-mini-end" style={{ width: STAGE_W * s, height: STAGE_H * s }}>End of slides</div>;
  return (
    <div className="vfm-mini" style={{ width: STAGE_W * s, height: STAGE_H * s }}>
      <div ref={ref} className={stageClass} style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${s})`, transformOrigin: "top left" }}>
        {renderSlide(slide, deck.render, { number: slide.cover ? undefined : index + 1 })}
      </div>
    </div>
  );
}

/** A slide's title as plain text, for tooltips. */
function inlineTitle(slide: SlideDeck["slides"][number]): string {
  const text = (n: any): string => (typeof n.value === "string" ? n.value : (n.children ?? []).map(text).join(""));
  return slide.title.map(text).join("") || "Untitled slide";
}

const THUMB_SCALE = 0.125;

/**
 * One thumbnail in the sidebar. A slide is only drawn once it is near the viewport (scores, diagrams and
 * algorithms are not free), then kept. The current one is scrolled into view.
 */
function Thumb({ deck, index, current, onPick, title }: { deck: SlideDeck; index: number; current: boolean; onPick: () => void; title: string }) {
  const box = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (current) box.current?.scrollIntoView({ block: "nearest" });
  }, [current]);
  return (
    <button
      ref={box}
      type="button"
      className={`vfm-thumb${current ? " vfm-current" : ""}`}
      onClick={onPick}
      title={`${index + 1}. ${title}`}
      aria-label={`Go to slide ${index + 1}: ${title}`}
      aria-current={current ? "true" : undefined}
    >
      <span className="vfm-thumb-number">{index + 1}</span>
      {near ? <MiniStage deck={deck} index={index} scale={THUMB_SCALE} /> : <span className="vfm-mini" style={{ width: STAGE_W * THUMB_SCALE, height: STAGE_H * THUMB_SCALE }} />}
    </button>
  );
}

/** Elapsed time since the presenter window opened; click to restart. */
function Timer() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <button className="vfm-presenter-timer" onClick={() => setSeconds(0)} title="Click to restart the timer">
      {mm}:{ss}
    </button>
  );
}

export function ProblemList({ items, title }: { items: Diagnostic[]; title: string }) {
  return (
    <div className="vfm-problems">
      <h3>{title}</h3>
      <ul>
        {items.map((d, i) => (
          <li key={i} className={`vfm-problem vfm-problem-${d.severity}`}>
            <span className="vfm-problem-where">
              {d.loc ? `${d.loc.file ? d.loc.file.split("/").pop() + ":" : "line "}${d.loc.line}` : ""}
            </span>{" "}
            {d.message} <span className="vfm-problem-code">[{d.code}]</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
