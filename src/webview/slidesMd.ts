/**
 * Export of the slide view as Markdown: the final slides, nothing else.
 *
 * Each rendered slide (after filtering, paragraph reduction, splitting and separators) is written as
 * its own `@slide[title] … @end` block with its presenter notes, so the file is itself a vfm slide
 * document. The YAML header is kept, with `paragraphs: full` so that loading the file again does not
 * reduce the already-reduced text a second time.
 */

import { toMarkdown } from "mdast-util-to-markdown";
import { gfmToMarkdown } from "mdast-util-gfm";
import { mathToMarkdown } from "mdast-util-math";
import { visit } from "unist-util-visit";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { buildSlideDeck, type Slide } from "@vfm/slides";
import { CITE_RE_SOURCE } from "@vfm/bibliography";
import { XREF_RE } from "@vfm/slides/labels";
import type { UpdateMessage } from "../protocol";

const KNOWN = new Set([
  "root", "paragraph", "heading", "text", "emphasis", "strong", "delete", "inlineCode", "code", "link", "image",
  "list", "listItem", "blockquote", "table", "tableRow", "tableCell", "thematicBreak", "break", "html", "math",
  "inlineMath", "footnoteReference", "footnoteDefinition", "linkReference", "imageReference", "definition",
  "fencedDiv", "highlight", "underline", "subSup",
]);

const tokenRe = () => new RegExp(`${CITE_RE_SOURCE}|${XREF_RE.source}`, "g");
const html = (value: string) => ({ type: "html", value });

/** Rewrites vfm's custom nodes into ones to-markdown writes in vfm syntax. Works on a copy. */
function prepare(nodes: any[]): any[] {
  const tree: any = structuredClone({ type: "root", children: nodes });
  const label = (n: any) => (n.label ? ` {#${n.label}}` : "");
  const info = (n: any) => `${n.caption ? " " + n.caption : ""}${label(n)}`;

  visit(tree, (node: any, index: number | undefined, parent: any) => {
    const data = node.data ?? {};
    switch (node.type) {
      case "algorithmBlock":
      case "musicBlock":
      case "mermaidBlock": {
        const lang = node.type === "algorithmBlock" ? "alg" : node.type === "musicBlock" ? "mus" : "mermaid";
        node.value = node.value ?? node.notation ?? node.source ?? "";
        node.lang = lang;
        node.meta = info(node).trim() || null;
        node.type = "code";
        break;
      }
      case "code":
        if (data.label || data.caption) node.meta = `${data.caption ?? ""}${data.label ? ` {#${data.label}}` : ""}`.trim();
        break;
      case "heading":
        if (data.label) node.children.push(html(` {#${data.label}}`));
        break;
      case "image":
        if (data.caption) node.alt = data.caption;
        if (data.label && parent) parent.children.splice(index! + 1, 0, html(` {#${data.label}}`));
        break;
      case "table":
        if ((data.caption || data.label) && parent) {
          parent.children.splice(index!, 0, { type: "paragraph", children: [html(`${data.caption ?? ""}${data.label ? ` {#${data.label}}` : ""}`.trim())] });
          return index! + 2;
        }
        break;
      case "vfmCallout":
        // A reducer callout (big value + caption) is written as one plain paragraph: value, space, caption.
        node.type = "paragraph";
        node.children = [{ type: "strong", children: node.children[0].children }, { type: "text", value: " " }, ...node.children[1].children];
        delete node.data;
        break;
      case "alertTitle":
        node.type = "paragraph";
        node.children = [html(`[!${String(node.children?.[0]?.value ?? "NOTE").toUpperCase()}]`)];
        break;
      case "text": {
        // @cite(...) and [@label] are plain text to vfm; keep them from being escaped.
        const parts: any[] = [];
        let at = 0;
        for (const m of node.value.matchAll(tokenRe())) {
          if (m.index! > at) parts.push({ type: "text", value: node.value.slice(at, m.index) });
          parts.push(html(m[0]));
          at = m.index! + m[0].length;
        }
        if (parts.length > 0 && parent) {
          if (at < node.value.length) parts.push({ type: "text", value: node.value.slice(at) });
          parent.children.splice(index!, 1, ...parts);
          return index! + parts.length;
        }
        break;
      }
    }
    if (node.type !== "root" && !KNOWN.has(node.type) && !["code"].includes(node.type)) {
      node.type = node.children ? "paragraph" : "html";
      if (!node.children) node.value = "";
    }
    return undefined;
  });
  return tree.children;
}

const options = {
  bullet: "-" as const,
  emphasis: "*" as const,
  strong: "*" as const,
  rule: "-" as const,
  fences: true,
  listItemIndent: "one" as const,
  extensions: [
    gfmToMarkdown(),
    mathToMarkdown(),
    {
      handlers: {
        fencedDiv(node: any, _parent: any, state: any, info: any) {
          const head = `:::${node.envType}${node.name ? " " + node.name : ""}${node.label ? ` {#${node.label}}` : ""}`;
          return `${head}\n${state.containerFlow(node, info)}\n:::`;
        },
        highlight(node: any, _parent: any, state: any, info: any) {
          return `==${state.containerPhrasing(node, info)}==`;
        },
        underline(node: any, _parent: any, state: any, info: any) {
          return `~${state.containerPhrasing(node, info)}~`;
        },
        subSup(node: any, _parent: any, state: any, info: any) {
          return `${node.data?.hName === "sup" ? "^" : "_"}{${state.containerPhrasing(node, info)}}`;
        },
      },
    },
  ],
};

const md = (nodes: any[]) => toMarkdown({ type: "root", children: prepare(nodes) } as any, options as any).trimEnd();
const inlineMd = (nodes: any[]) => md([{ type: "paragraph", children: nodes }]).replace(/\n+/g, " ");

function slideBlock(slide: Slide): string {
  const opts: string[] = [];
  if (slide.layout !== "single") opts.push(slide.layout);
  if (slide.sourceBlock.options.showrefs) opts.push("showrefs");
  const title = slide.title.length > 0 || slide.titleSource === "override" ? `[${inlineMd(slide.title).replace(/\]/g, "\\]")}]` : "";
  const open = `@slide${title}${opts.length ? `(${opts.join(", ")})` : ""}`;
  // The heading repeated at the top of a continuation is context, not content.
  const body = slide.body.filter((b: any) => !(b.type === "heading" && b.data?.hProperties?.className?.includes("vfm-continued")));
  const parts = [md([...body, ...slide.images])];
  for (const note of slide.notes) parts.push(`@note(${inlineMd(note).replace(/\)/g, "\\)")})`);
  const lead = slide.leadin?.length ? `(${inlineMd(slide.leadin).replace(/\)/g, "\\)")})` : "";
  return `${open}\n${parts.filter(Boolean).join("\n")}\n@end${lead}`;
}

export function slidesToMarkdown(state: UpdateMessage): string {
  const deck = buildSlideDeck(state.text, { sourceMap: state.sourceMap, maxHeadings: state.options.maxHeadings });
  let header: Record<string, unknown> = {};
  const m = /^﻿?---[ \t]*\r?\n([\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(state.text);
  if (m) {
    try {
      header = (parseYaml(m[1] ?? "") as Record<string, unknown>) ?? {};
    } catch {
      /* keep an empty header */
    }
  }
  header.paragraphs = "full";
  const out = [`---\n${stringifyYaml(header).trimEnd()}\n---`];
  for (const slide of deck.slides) if (!slide.cover) out.push(slideBlock(slide));
  return out.join("\n\n") + "\n";
}
