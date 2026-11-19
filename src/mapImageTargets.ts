/**
 * Finds the target of every Markdown image, `![alt](target "title")`, and lets a caller rewrite it.
 *
 * The alt text may hold brackets of its own, as a caption with a link does (`![[text](url)](picture.png)`),
 * so the alt text is read by counting brackets and not by a pattern that stops at the first `]`. Shared by the
 * HTML export, which embeds the pictures, and by the preview, which asks when each picture last changed.
 */

/** `map` gets each raw target (as written, without `<…>`) and returns its replacement, or undefined to keep it. */
export function mapImageTargets(text: string, map: (target: string) => string | undefined): string {
  let out = "";
  let i = 0;
  for (;;) {
    const at = text.indexOf("![", i);
    if (at < 0) return out + text.slice(i);
    // The alt text ends at the bracket that balances the first one. A blank line ends the paragraph, so it ends the search.
    let depth = 0;
    let j = at + 1;
    for (; j < text.length; j++) {
      const c = text[j];
      if (c === "\\") j++;
      else if (c === "[") depth++;
      else if (c === "]" && --depth === 0) break;
      else if (c === "\n" && /^\n[ \t]*\r?\n/.test(text.slice(j))) {
        j = text.length;
        break;
      }
    }
    if (j >= text.length || text[j + 1] !== "(") {
      out += text.slice(i, at + 2);
      i = at + 2;
      continue;
    }
    let k = j + 2;
    while (k < text.length && /[ \t]/.test(text[k])) k++;
    let target: string;
    let end: number;
    if (text[k] === "<") {
      const close = text.indexOf(">", k);
      if (close < 0 || text.slice(k, close).includes("\n")) {
        out += text.slice(i, at + 2);
        i = at + 2;
        continue;
      }
      target = text.slice(k + 1, close);
      end = close + 1;
    } else {
      let e = k;
      while (e < text.length && !/[\s)]/.test(text[e])) e++;
      target = text.slice(k, e);
      end = e;
    }
    if (!/^(?:\s+"[^"]*")?\s*\)/.test(text.slice(end))) {
      out += text.slice(i, at + 2);
      i = at + 2;
      continue;
    }
    const replacement = map(target);
    out += text.slice(i, k) + (replacement === undefined ? text.slice(k, end) : replacement);
    i = end;
  }
}
