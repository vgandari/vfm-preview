import type { BibEntry, BibliographyMap } from "../../vfm/bibliography";

/**
 * What `@cite` needs: every entry of the document's bibliography file(s), by key. Only when the text
 * cites something, so a document without citations is rendered exactly as before. A cited key missing
 * from the file then shows as a red "unknown citation" marker instead of staying as literal `@cite(…)`.
 */
export function bibliographyFor(text: string, bib: Record<string, BibEntry> | undefined): BibliographyMap | undefined {
  if (!/@cite\(/.test(text)) return undefined;
  return new Map(Object.entries(bib ?? {}));
}
