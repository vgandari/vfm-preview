/**
 * Loads the `bibliography:` file(s) named in a document's YAML header, so `@cite(key)` can resolve.
 *
 *   bibliography: refs.bib              or    bibliography: [refs.bib, more/other.bib]
 *
 * A relative path is looked for next to the Markdown file first (the usual convention for Pandoc and
 * friends), then in each workspace folder, the one holding the document first. An absolute path is used
 * as written. The first file found for a name wins; an open editor's unsaved text is preferred to the
 * file on disk. Entries from several files are merged; a key already seen is not replaced.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { parseBibTeX } from "../vfm/bibtex";
import { parseFrontmatter } from "../vfm/frontmatter";
import type { BibEntry } from "../vfm/bibliography";
import type { Diagnostic } from "../vfm/slides/types";

export interface LoadedBibliography {
  entries: Record<string, BibEntry>;
  /** Every file read, so editing one refreshes the preview. */
  files: string[];
  diagnostics: Diagnostic[];
}

/** Where `name` is looked for, in order. */
export function bibliographyCandidates(name: string, docFile: string): string[] {
  if (path.isAbsolute(name)) return [name];
  const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const holding = folders.find((f) => docFile.startsWith(f + path.sep));
  const roots = [path.dirname(docFile), ...(holding ? [holding] : []), ...folders];
  return [...new Set(roots.map((r) => path.resolve(r, name)))];
}

function readText(file: string): string | undefined {
  const open = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === file);
  if (open) return open.getText();
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

export function loadBibliography(docFile: string, text: string): LoadedBibliography {
  const out: LoadedBibliography = { entries: {}, files: [], diagnostics: [] };
  let names: string[] = [];
  try {
    names = parseFrontmatter(text).meta.bibliography;
  } catch {
    return out; // a broken header is reported by whoever renders it
  }
  if (names.length === 0) return out;
  // The `bibliography:` line, so a missing file is reported where it is named.
  const line = Math.max(1, text.split("\n").findIndex((l) => /^bibliography\s*:/.test(l)) + 1);

  for (const name of names) {
    const tried = bibliographyCandidates(name, docFile);
    const found = tried.find((f) => readText(f) !== undefined);
    if (!found) {
      out.diagnostics.push({
        code: "bibliography",
        severity: "warning",
        message: `bibliography file "${name}" not found. Looked in: ${tried.join(", ")}`,
        loc: { line },
      });
      continue;
    }
    out.files.push(found);
    const parsed = parseBibTeX(readText(found)!);
    for (const e of parsed.entries) if (!(e.citeKey in out.entries)) out.entries[e.citeKey] = e;
    for (const e of parsed.errors) {
      out.diagnostics.push({ code: "bibliography", severity: "warning", message: `${path.basename(found)}: ${e.message}`, loc: { file: found, line: e.line } });
    }
  }
  return out;
}
