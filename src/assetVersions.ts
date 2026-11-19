/**
 * When did each local picture or video of a document last change?
 *
 * The preview loads pictures by URL, and a webview keeps a picture it already has: change the file on disk and the
 * same URL still shows the old one until the Markdown itself changes in a way that drops the picture. The host sends
 * the modification time of each file with every update, and the preview adds it to the URL (`?vfm=…`), so a changed
 * file has a new URL and an unchanged one keeps its cached copy. Nothing watches the files: the times are read when
 * the preview is rendered, which every edit and every return to the preview does.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { mapImageTargets } from "./mapImageTargets.ts";

/** True for a URL the preview does not load from disk: a scheme, a protocol-relative URL or a fragment. */
const isRemote = (raw: string) => /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(raw);

/** The raw paths of the local pictures and videos named in `text` (and `title-image` in its YAML header). */
export function localAssetPaths(text: string): string[] {
  const found = new Set<string>();
  mapImageTargets(text, (target) => {
    if (target && !isRemote(target)) found.add(target);
    return undefined;
  });
  const header = /^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/.exec(text);
  const title = header && /^title-image:[ \t]*["']?([^"'\r\n]+?)["']?[ \t]*$/m.exec(header[0]);
  if (title && !isRemote(title[1])) found.add(title[1]);
  return [...found];
}

/** Modification time (ms) of each local asset of `text` that exists, by the path as written; paths are relative to `baseDir`. */
export function assetVersions(text: string, baseDir: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const raw of localAssetPaths(text)) {
    try {
      out[raw] = Math.round(fs.statSync(path.resolve(baseDir, decodeURIComponent(raw.split(/[?#]/)[0]))).mtimeMs);
    } catch {
      /* missing or unreadable: no version, the URL stays as written */
    }
  }
  return out;
}
