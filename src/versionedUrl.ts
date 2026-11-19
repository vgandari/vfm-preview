/**
 * A picture's URL with the time its file last changed (see assetVersions.ts), so that a changed file is a new URL
 * and the webview does not show its cached copy. Pure, so the webview and the tests can both use it.
 */

/** `url` with `vfm=<time>` added when `versions` has a time for the path as `written`; otherwise `url` as it is. */
export function versionedUrl(url: string, written: string, versions: Record<string, number> | undefined): string {
  // The page may know the path percent-encoded where the file names it with a space.
  let decoded = written;
  try {
    decoded = decodeURIComponent(written);
  } catch {
    /* not percent-encoded text */
  }
  const v = versions?.[written] ?? versions?.[decoded];
  if (v === undefined) return url;
  return url + (url.includes("?") ? "&" : "?") + `vfm=${v}`;
}
