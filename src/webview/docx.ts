/**
 * Word export. Builds the body of word/document.xml from the document's mdast and puts it into the
 * template named in the YAML header (`docx-template:`): the template keeps its styles, page setup,
 * headers and footers; only the body is replaced. Without a template a plain built-in one is used.
 *
 * Styles are looked up by id (Title, Heading1…, Quote, Caption, ListBullet, TableGrid, Code…) and used
 * when the template defines them; otherwise the same look is applied directly. Lists are numbered by
 * hand so they do not depend on the template's numbering definitions.
 * Math is written as its TeX source, algorithms and scores as their source text, Mermaid diagrams as
 * pictures, and images that were inlined by the host as pictures.
 */

import JSZip from "jszip";
import type { Root } from "mdast";
import { parseDocument, parseFrontmatter } from "@vfm/pipeline";
import type { UpdateMessage } from "../protocol";
import { renderMermaid } from "@vfm/MermaidDiagram";
import { isVideoUrl } from "@vfm/plugins/video-url";
import { bibliographyFor } from "./bib";
import { ensureDefault, esc, IMAGE_MIME, load, pictureFrom, svgToPicture, svgDataUrl, text, toBase64, EMU_PER_PX, type Picture } from "./ooxml";

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// ─── Built-in template ────────────────────────────────────────────────────────

function style(id: string, name: string, ppr = "", rpr = "", basedOn = "Normal", type = "paragraph") {
  return `<w:style w:type="${type}" w:styleId="${id}"><w:name w:val="${name}"/>${basedOn ? `<w:basedOn w:val="${basedOn}"/>` : ""}<w:qFormat/>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}</w:style>`;
}

async function builtInTemplate(): Promise<JSZip> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`
  );
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/></Relationships>`);
  const heading = (n: number, size: number) =>
    style(`Heading${n}`, `heading ${n}`, `<w:keepNext/><w:spacing w:before="${n === 1 ? 360 : 240}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/>`, `<w:b/><w:sz w:val="${size}"/>`);
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
      `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
      style("Title", "Title", '<w:spacing w:after="120"/>', '<w:b/><w:sz w:val="48"/>') +
      style("Subtitle", "Subtitle", "", '<w:i/><w:sz w:val="28"/>') +
      [1, 2, 3, 4, 5, 6].map((n) => heading(n, [36, 30, 26, 24, 22, 22][n - 1])).join("") +
      style("Quote", "Quote", '<w:ind w:left="720"/>', "<w:i/>") +
      style("Caption", "caption", '<w:spacing w:after="200"/>', '<w:i/><w:sz w:val="20"/>') +
      style("Code", "Code", '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="18"/>') +
      `<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`).join("")}</w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
      `</w:styles>`
  );
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return zip;
}

// ─── Writer ───────────────────────────────────────────────────────────────────

interface Fmt {
  b?: boolean;
  i?: boolean;
  code?: boolean;
  strike?: boolean;
  underline?: boolean;
  sup?: boolean;
  sub?: boolean;
  hl?: boolean;
  link?: boolean;
  size?: number;
}

interface Ctx {
  styles: Set<string>;
  rels: string[];
  media: Array<{ name: string; pic: Picture }>;
  nextRel: number;
  nextId: number;
  maxWidthEmu: number;
  bookmarks: Map<string, string>;
  footnotes: Map<string, any>;
  footnoteOrder: string[];
  pending: Array<Promise<void>>;
}

const bookmarkName = (ctx: Ctx, label: string) => {
  let name = ctx.bookmarks.get(label);
  if (!name) {
    name = `_vfm${ctx.bookmarks.size + 1}`;
    ctx.bookmarks.set(label, name);
  }
  return name;
};

function rPr(f: Fmt): string {
  return (
    (f.link ? '<w:color w:val="0563C1"/>' : "") +
    (f.link || f.underline ? '<w:u w:val="single"/>' : "") +
    (f.code ? '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>' : "") +
    (f.b ? "<w:b/>" : "") +
    (f.i ? "<w:i/>" : "") +
    (f.strike ? "<w:strike/>" : "") +
    (f.size ? `<w:sz w:val="${f.size}"/>` : f.code ? '<w:sz w:val="20"/>' : "") +
    (f.hl ? '<w:highlight w:val="yellow"/>' : "") +
    (f.sup ? '<w:vertAlign w:val="superscript"/>' : "") +
    (f.sub ? '<w:vertAlign w:val="subscript"/>' : "")
  );
}

const run = (value: string, f: Fmt) => {
  const props = rPr(f);
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(value)}</w:t></w:r>`;
};

const plain = (n: any): string => (typeof n.value === "string" ? n.value : (n.children ?? []).map(plain).join(""));

function drawing(ctx: Ctx, pic: Picture, alt: string): string {
  const rid = `rId${ctx.nextRel++}`;
  const name = `image${ctx.media.length + 1}.${pic.ext === "jpeg" ? "jpg" : pic.ext}`;
  ctx.media.push({ name, pic });
  ctx.rels.push(`<Relationship Id="${rid}" Type="${REL}/image" Target="media/${name}"/>`);
  let cx = pic.width * EMU_PER_PX;
  let cy = pic.height * EMU_PER_PX;
  if (cx > ctx.maxWidthEmu) {
    cy = Math.round((cy * ctx.maxWidthEmu) / cx);
    cx = ctx.maxWidthEmu;
  }
  const id = ctx.nextId++;
  return (
    `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}" descr="${esc(alt)}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

/** Inline content as runs. Pictures load asynchronously, so a placeholder is swapped in afterwards. */
function inline(nodes: any[], ctx: Ctx, f: Fmt = {}): string {
  return nodes.map((n) => inlineNode(n, ctx, f)).join("");
}

function inlineNode(n: any, ctx: Ctx, f: Fmt): string {
  switch (n.type) {
    case "text":
      return run(n.value.replace(/\s*\n\s*/g, " "), f);
    case "strong":
      return inline(n.children, ctx, { ...f, b: true });
    case "emphasis":
      return inline(n.children, ctx, { ...f, i: true });
    case "delete":
      return inline(n.children, ctx, { ...f, strike: true });
    case "underline":
      return inline(n.children, ctx, { ...f, underline: true });
    case "highlight":
      return inline(n.children, ctx, { ...f, hl: true });
    case "subSup": // `^{x}` and `_{x}`: vertical alignment runs (REQ-135)
      return inline(n.children, ctx, n.data?.hName === "sup" ? { ...f, sup: true, sub: false } : { ...f, sub: true, sup: false });
    case "inlineCode":
      return run(n.value, { ...f, code: true });
    case "inlineMath":
      return run(n.value, { ...f, i: true });
    case "break":
      return "<w:r><w:br/></w:r>";
    case "footnoteReference": {
      if (!ctx.footnoteOrder.includes(n.identifier)) ctx.footnoteOrder.push(n.identifier);
      return run(`[${ctx.footnoteOrder.indexOf(n.identifier) + 1}]`, { ...f, sup: true });
    }
    case "link": {
      const inner = inline(n.children, ctx, { ...f, link: true });
      if (String(n.url).startsWith("#")) return `<w:hyperlink w:anchor="${bookmarkName(ctx, decodeURIComponent(n.url.slice(1)))}">${inner}</w:hyperlink>`;
      const rid = `rId${ctx.nextRel++}`;
      ctx.rels.push(`<Relationship Id="${rid}" Type="${REL}/hyperlink" Target="${esc(n.url)}" TargetMode="External"/>`);
      return `<w:hyperlink r:id="${rid}">${inner}</w:hyperlink>`;
    }
    case "image": {
      // A video cannot be placed in Word: the caption and the file name stand in for it (REQ-148).
      if (isVideoUrl(n.url)) return run(`[video: ${n.alt ? n.alt + ", " : ""}${decodeURIComponent(String(n.url).split(/[?#]/)[0].split("/").pop() ?? "")}]`, { ...f, i: true });
      const token = `@@IMG${ctx.pending.length}@@`;
      ctx.pending.push(
        pictureFrom(n.url).then((pic) => {
          (ctx as any).filled ??= new Map<string, string>();
          (ctx as any).filled.set(token, pic ? drawing(ctx, pic, n.alt ?? "") : run(`[image: ${n.alt || n.url.slice(0, 40)}]`, { ...f, i: true }));
        })
      );
      return token;
    }
    case "html":
      return "";
    default:
      return n.children ? inline(n.children, ctx, f) : n.value ? run(String(n.value), f) : "";
  }
}

const hasStyle = (ctx: Ctx, id: string) => ctx.styles.has(id);

function para(ctx: Ctx, content: string, opts: { style?: string; ppr?: string; bookmark?: string } = {}): string {
  const style = opts.style && hasStyle(ctx, opts.style) ? `<w:pStyle w:val="${opts.style}"/>` : "";
  const ppr = style + (opts.ppr ?? "");
  let body = content;
  if (opts.bookmark) {
    const id = ctx.nextId++;
    body = `<w:bookmarkStart w:id="${id}" w:name="${opts.bookmark}"/>${content}<w:bookmarkEnd w:id="${id}"/>`;
  }
  return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${body}</w:p>`;
}

const CODE_PPR = '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="360"/>';

function codeBlock(ctx: Ctx, value: string): string {
  const lines = value.replace(/\n$/, "").split("\n");
  const hasCode = hasStyle(ctx, "Code") || hasStyle(ctx, "SourceCode");
  const f: Fmt = hasCode ? {} : { code: true, size: 18 };
  const id = hasStyle(ctx, "Code") ? "Code" : "SourceCode";
  const runs = lines.map((l, i) => (i ? "<w:r><w:br/></w:r>" : "") + run(l, f)).join("");
  return para(ctx, runs, { style: id, ppr: hasCode ? "" : CODE_PPR });
}

function caption(ctx: Ctx, label: string | undefined, displayText: string | undefined, cap: string | null | undefined): string {
  if (!displayText && !cap) return "";
  const content = (displayText ? run(displayText, { b: true }) : "") + (displayText && cap ? run(": ", {}) : "") + (cap ? run(cap, {}) : "");
  const direct = hasStyle(ctx, "Caption") ? "" : '<w:spacing w:after="200"/>';
  return para(ctx, content, { style: "Caption", ppr: direct, bookmark: label ? bookmarkName(ctx, label) : undefined });
}

function listBlock(ctx: Ctx, node: any, level: number): string {
  const out: string[] = [];
  node.children.forEach((item: any, i: number) => {
    const marker = node.ordered ? `${(node.start ?? 1) + i}.` : item.checked === true ? "☑" : item.checked === false ? "☐" : "•";
    const ind = `<w:ind w:left="${720 + level * 360}" w:hanging="360"/>`;
    const nativeBullet = !node.ordered && item.checked == null && hasStyle(ctx, level === 0 ? "ListBullet" : `ListBullet${level + 1}`);
    let first = true;
    for (const child of item.children) {
      if (child.type === "list") out.push(listBlock(ctx, child, level + 1));
      else if (child.type === "paragraph") {
        const lead = first ? (nativeBullet ? "" : run(marker, {}) + "<w:r><w:tab/></w:r>") : "";
        out.push(para(ctx, lead + inline(child.children, ctx), nativeBullet ? { style: level === 0 ? "ListBullet" : `ListBullet${level + 1}` } : { ppr: ind }));
        first = false;
      } else out.push(block(ctx, child, level + 1));
    }
  });
  return out.join("");
}

function tableBlock(ctx: Ctx, node: any): string {
  const cols = Math.max(...node.children.map((r: any) => r.children.length), 1);
  const grid = Array.from({ length: cols }, () => `<w:gridCol w:w="${Math.floor(9000 / cols)}"/>`).join("");
  const look = hasStyle(ctx, "TableGrid")
    ? '<w:tblStyle w:val="TableGrid"/>'
    : `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`).join("")}</w:tblBorders>`;
  const rows = node.children
    .map((row: any, r: number) => {
      const cells = row.children
        .map((cell: any, c: number) => {
          const jc = node.align?.[c] ? `<w:jc w:val="${node.align[c] === "center" ? "center" : node.align[c]}"/>` : "";
          return `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(9000 / cols)}" w:type="dxa"/></w:tcPr>${para(ctx, inline(cell.children, ctx, r === 0 ? { b: true } : {}), { ppr: `<w:spacing w:after="0"/>${jc}` })}</w:tc>`;
        })
        .join("");
      return `<w:tr>${r === 0 ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells}</w:tr>`;
    })
    .join("");
  return `<w:tbl><w:tblPr>${look}<w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`;
}

function blocks(ctx: Ctx, nodes: any[], level = 0): string {
  return nodes.map((n) => block(ctx, n, level)).join("");
}

function block(ctx: Ctx, n: any, level = 0): string {
  const d = n.data ?? {};
  switch (n.type) {
    case "heading": {
      const depth = Math.min(6, n.depth);
      const styled = hasStyle(ctx, `Heading${depth}`);
      const f: Fmt = styled ? {} : { b: true, size: [36, 30, 26, 24, 22, 22][depth - 1] };
      const num = d.displayNumber ? `${d.displayNumber} ` : "";
      return para(ctx, run(num, f) + inline(n.children, ctx, f), {
        style: `Heading${depth}`,
        ppr: styled ? "" : "<w:keepNext/>",
        bookmark: d.label ? bookmarkName(ctx, d.label) : undefined,
      });
    }
    case "paragraph": {
      if (n.children.length === 1 && n.children[0].type === "image") {
        const img = n.children[0];
        const cap = img.data?.caption ?? null;
        return para(ctx, inline([img], ctx), { ppr: '<w:keepNext/><w:jc w:val="center"/>', bookmark: img.data?.label ? bookmarkName(ctx, img.data.label) : undefined }) + caption(ctx, undefined, img.data?.displayText, cap);
      }
      return para(ctx, inline(n.children, ctx), { ppr: level ? `<w:ind w:left="${level * 360}"/>` : "" });
    }
    case "list":
      return listBlock(ctx, n, level);
    case "code":
      return caption(ctx, d.label, d.displayText, d.caption) + codeBlock(ctx, n.value);
    case "math":
      return para(ctx, run(n.value.replace(/\n/g, " "), { i: true }) + (d.displayNumber ? "<w:r><w:tab/></w:r>" + run(`(${d.displayNumber})`, {}) : ""), { ppr: '<w:jc w:val="center"/>' });
    case "blockquote": {
      const alert = d.hProperties?.className?.includes?.("alert");
      const body = n.children.map((c: any) =>
        c.type === "alertTitle" ? para(ctx, inline(c.children, ctx, { b: true }), { ppr: '<w:ind w:left="720"/>' }) : c.type === "paragraph"
          ? para(ctx, inline(c.children, ctx, hasStyle(ctx, "Quote") ? {} : { i: !alert }), { style: "Quote", ppr: hasStyle(ctx, "Quote") ? "" : '<w:ind w:left="720"/>' })
          : block(ctx, c, level + 2)
      );
      return body.join("");
    }
    case "table": {
      return caption(ctx, d.label, d.displayText, d.caption) + tableBlock(ctx, n) + para(ctx, "", { ppr: '<w:spacing w:after="0"/>' });
    }
    case "thematicBreak":
      return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="808080"/></w:pBdr></w:pPr></w:p>`;
    case "fencedDiv": {
      const head = [n.displayText ?? n.envType.replace(/^./, (c: string) => c.toUpperCase()), n.name ? ` (${n.name})` : ""].join("");
      return para(ctx, run(head, { b: true }), { ppr: '<w:keepNext/><w:ind w:left="360"/>', bookmark: n.label ? bookmarkName(ctx, n.label) : undefined }) + blocks(ctx, n.children, level + 1);
    }
    case "algorithmBlock":
    case "musicBlock":
      return caption(ctx, n.label ?? undefined, n.displayText, n.caption) + codeBlock(ctx, n.value ?? n.notation);
    case "mermaidBlock": {
      const token = `@@IMG${ctx.pending.length}@@`;
      ctx.pending.push(
        mermaidPicture(n.source).then((pic) => {
          (ctx as any).filled ??= new Map<string, string>();
          (ctx as any).filled.set(token, pic ? drawing(ctx, pic, n.caption ?? "diagram") : "");
          if (!pic) (ctx as any).filled.set(token, "");
        })
      );
      return `@@BLOCK${token}@@` + caption(ctx, n.label ?? undefined, n.displayText, n.caption);
    }
    case "footnoteDefinition":
    case "definition":
      return "";
    case "html":
      return "";
    default:
      return n.children ? blocks(ctx, n.children, level) : "";
  }
}

/** A Mermaid diagram as a PNG, or undefined when it cannot be drawn. */
export async function mermaidPicture(source: string): Promise<Picture | undefined> {
  try {
    let svg = await renderMermaid(source, false, true);
    const vb = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg);
    if (vb) svg = svg.replace(/<svg([^>]*?)\swidth="[^"]*"/, "<svg$1").replace(/<svg /, `<svg width="${vb[1]}" height="${vb[2]}" `);
    return await svgToPicture(svgDataUrl(svg));
  } catch {
    return undefined;
  }
}

// ─── Entry ────────────────────────────────────────────────────────────────────

export async function exportDocx(state: UpdateMessage, templateBase64?: string): Promise<string> {
  const zip = (await load(templateBase64)) ?? (await builtInTemplate());
  const docPath = "word/document.xml";
  const docXml = await text(zip, docPath);
  if (!docXml) throw new Error("The template is not a Word file (no word/document.xml).");
  const stylesXml = (await text(zip, "word/styles.xml")) ?? "";
  const relsPath = "word/_rels/document.xml.rels";
  let relsXml = (await text(zip, relsPath)) ?? `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

  // Keep the template's page setup, headers and footers: its last section properties.
  const sect = [...docXml.matchAll(/<w:sectPr[\s\S]*?<\/w:sectPr>/g)].pop()?.[0] ?? "";
  const pgW = Number(/<w:pgSz[^>]*w:w="(\d+)"/.exec(sect)?.[1] ?? 12240);
  const left = Number(/w:left="(\d+)"/.exec(sect)?.[1] ?? 1440);
  const right = Number(/w:right="(\d+)"/.exec(sect)?.[1] ?? 1440);
  const nextRel = Math.max(0, ...[...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]))) + 1;

  const ctx: Ctx = {
    styles: new Set([...stylesXml.matchAll(/w:styleId="([^"]+)"/g)].map((m) => m[1])),
    rels: [],
    media: [],
    nextRel,
    nextId: 100,
    maxWidthEmu: Math.max(1, pgW - left - right) * 635,
    bookmarks: new Map(),
    footnotes: new Map(),
    footnoteOrder: [],
    pending: [],
  };

  const { tree, registry: _registry } = parseDocument(state.text, { numberingDepth: state.options.numberingDepth, numberCaptions: state.options.numberCaptions, headingShift: 0, id: null, sourceMap: state.sourceMap, bibliography: bibliographyFor(state.text, state.bib) });
  void _registry;
  const root = tree as Root;
  for (const n of root.children as any[]) if (n.type === "footnoteDefinition") ctx.footnotes.set(n.identifier, n);

  let body = frontMatterBlocks(ctx, state.text) + blocks(ctx, root.children as any[]);
  if (ctx.footnoteOrder.length > 0) {
    body += ctx.footnoteOrder
      .map((id, i) => {
        const def = ctx.footnotes.get(id);
        const textOf = def ? def.children.map((c: any) => inline(c.children ?? [], ctx)).join(" ") : "";
        return para(ctx, run(`[${i + 1}] `, { sup: false, b: true }) + textOf, { ppr: '<w:spacing w:after="60"/>' });
      })
      .join("");
  }
  await Promise.all(ctx.pending);
  const filled: Map<string, string> = (ctx as any).filled ?? new Map();
  // Block-level pictures get their own paragraph; inline ones are runs.
  body = body.replace(/@@BLOCK(@@IMG\d+@@)@@/g, (_m, token) => (filled.get(token) ? para(ctx, filled.get(token)!, { ppr: '<w:keepNext/><w:jc w:val="center"/>' }) : ""));
  body = body.replace(/@@IMG\d+@@/g, (token) => filled.get(token) ?? "");

  const head = /^[\s\S]*?<w:body>/.exec(docXml)?.[0] ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>`;
  // Hyperlinks use r:id, so the root must declare r; the drawing parts declare their own namespaces.
  const wrapped = head.includes("xmlns:r=") ? head : head.replace("<w:document", `<w:document xmlns:r="${REL}"`);
  zip.file(docPath, `${wrapped}${body}${sect}</w:body></w:document>`);

  relsXml = relsXml.replace("</Relationships>", `${ctx.rels.join("")}</Relationships>`);
  zip.file(relsPath, relsXml);
  for (const m of ctx.media) zip.file(`word/media/${m.name}`, m.pic.bytes);

  let types = (await text(zip, "[Content_Types].xml")) ?? "";
  // A .dotx names its main part as a template; once saved as .docx it must be a document.
  types = types.replace("wordprocessingml.template.main+xml", "wordprocessingml.document.main+xml");
  for (const ext of new Set(ctx.media.map((m) => m.pic.ext))) types = ensureDefault(types, ext === "jpeg" ? "jpg" : ext, IMAGE_MIME[ext]);
  zip.file("[Content_Types].xml", types);
  return toBase64(zip);
}

function frontMatterBlocks(ctx: Ctx, source: string): string {
  let meta;
  try {
    meta = parseFrontmatter(source).meta;
  } catch {
    return "";
  }
  const out: string[] = [];
  const direct = (id: string, ppr: string) => (hasStyle(ctx, id) ? "" : ppr);
  if (meta.title) out.push(para(ctx, run(meta.title, hasStyle(ctx, "Title") ? {} : { b: true, size: 48 }), { style: "Title" }));
  if (meta.subtitle) out.push(para(ctx, run(meta.subtitle, hasStyle(ctx, "Subtitle") ? {} : { i: true, size: 28 }), { style: "Subtitle" }));
  if (meta.authors.length) out.push(para(ctx, run(meta.authors.map((a) => a.name).join(", "), {}), { ppr: direct("Subtitle", "") }));
  const affiliations = [...new Set(meta.authors.flatMap((a) => a.affiliations.map((x) => [x.department, x.name].filter(Boolean).join(", "))))];
  for (const a of affiliations) out.push(para(ctx, run(a, { i: true }), { ppr: '<w:spacing w:after="0"/>' }));
  if (meta.date) out.push(para(ctx, run(meta.date, {})));
  if (meta.abstract) {
    out.push(para(ctx, run("Abstract", { b: true }), { ppr: "<w:keepNext/>" }));
    try {
      out.push(blocks(ctx, (parseDocument(meta.abstract, { numberingDepth: 0, headingShift: 0, id: null }).tree as Root).children as any[]));
    } catch {
      out.push(para(ctx, run(meta.abstract, {})));
    }
  }
  return out.join("");
}
