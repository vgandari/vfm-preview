/** Messages between the extension host and the preview webview. */

import type { Diagnostic, SourceLoc } from "@vfm/slides";
import type { BibEntry } from "@vfm/bibliography";

/** "document" renders everything; "slides" renders only the `@slide` blocks, as a slideshow. */
export type Mode = "document" | "slides";

export interface RenderOptions {
  numberingDepth: number;
  /** Document mode: number every caption ("all") or only the ones a cross-reference points to ("referenced"). */
  numberCaptions: "all" | "referenced";
  maxWidth: number;
  /** "vfm": vfm's own light/dark palettes. "vscode": colors inherited from the active VS Code theme. */
  theme: "vfm" | "vscode";
  mode: Mode;
  /** Slide mode: warn when a content slide holds more headings than this. */
  maxHeadings: number;
  /** Exports only: lay slides out one per page with every step shown. */
  print?: boolean;
}

/** What an export command asks the webview to build. */
export type ExportFormat = "docx" | "pptx" | "slides-md";

export type HostMessage =
  | UpdateMessage
  /** The editor scrolled: its top visible line (1-based, in the main file). Document mode follows it. */
  | { type: "scroll"; line: number }
  /** Build a file from the current text. `template` is the base64 of the file named in the YAML header. */
  | { type: "export"; format: ExportFormat; template?: string; text?: string };

export type UpdateMessage = {
  type: "update";
  /** The document with `@include`s expanded. */
  text: string;
  /** Webview URI of the document's folder, used to resolve relative images. */
  baseUri: string;
  options: RenderOptions;
  /** Where each line of `text` came from; absent when nothing was included. */
  sourceMap?: SourceLoc[];
  /** Entries of the `bibliography:` file(s) in the YAML header, by cite key, for `@cite(key)`. */
  bib?: Record<string, BibEntry>;
};

export type WebviewMessage =
  | { type: "ready" }
  | { type: "openLink"; href: string }
  /** Slide-directive problems found while rendering, for the Problems panel. */
  | { type: "diagnostics"; items: Diagnostic[] }
  /** Double click in the preview: show this place in the editor. `word` is the text that was clicked. */
  | { type: "reveal"; loc: SourceLoc; word?: string }
  /** A task checkbox was clicked: flip it in the file (the file, not the page, says what it is now). */
  | { type: "toggleTask"; loc: SourceLoc }
  /** The preview was scrolled by the user: the line at its top (1-based, main file). */
  | { type: "scrollEditor"; line: number }
  /** Result of an export request: base64 file contents, or why it failed. */
  | { type: "exported"; format: ExportFormat; data?: string; error?: string };
