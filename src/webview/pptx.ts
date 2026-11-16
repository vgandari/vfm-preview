/**
 * PowerPoint export. Writes the final slides (after filtering, paragraph reduction and splitting) into
 * the template named in the YAML header (`pptx-template:`, optional): the template keeps its master, layouts,
 * theme and fonts; its sample slides are removed and each slide here uses the template's
 * "Title Slide", "Title and Content" or "Section Header" layout by placeholder, so geometry and
 * bullet styles come from the template.
 *
 * Text, bullets, numbered lists, callouts, code (monospace), tables, images and Mermaid diagrams
 * (as pictures) are written natively; math, algorithms and scores become their source text.
 * Presenter notes are written when the template has a notes master. Without a template a plain
 * built-in 16:9 one is used.
 */

import JSZip from "jszip";
import type { UpdateMessage } from "../protocol";
import { buildSlideDeck, type Slide } from "../../vfm/slides";
import { XREF_RE } from "../../vfm/slides/labels";
import { ensureDefault, esc, IMAGE_MIME, load, pictureFrom, text, toBase64, EMU_PER_PX, type Picture } from "./ooxml";
import { mermaidPicture } from "./docx";
import { CITE_RE_SOURCE, formatReference, splitCiteKeys } from "../../vfm/bibliography";

const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const REL = NS_R;

interface LayoutInfo {
  path: string;
  name: string;
  type: string;
  phs: Array<{ attrs: string; type: string; idx: string; box?: Box }>;
}
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const attr = (s: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(s)?.[1] ?? "";

async function readLayouts(zip: JSZip): Promise<LayoutInfo[]> {
  const out: LayoutInfo[] = [];
  for (const path of Object.keys(zip.files).filter((f) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f))) {
    const xml = (await text(zip, path))!;
    const phs = [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].flatMap((m) => {
      const ph = /<p:ph([^>]*?)\/?>/.exec(m[0]);
      if (!ph) return [];
      const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(m[0]);
      return [{ attrs: ph[1], type: attr(ph[1], "type"), idx: attr(ph[1], "idx"), box: off ? { x: +off[1], y: +off[2], w: +off[3], h: +off[4] } : undefined }];
    });
    out.push({ path, name: attr(/<p:cSld[^>]*>/.exec(xml)?.[0] ?? "", "name"), type: attr(/<p:sldLayout[^>]*>/.exec(xml)?.[0] ?? "", "type"), phs });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

const isTitle = (p: { type: string }) => p.type === "title" || p.type === "ctrTitle";
const isBody = (p: { type: string; idx: string }) => p.type === "body" || p.type === "obj" || p.type === "subTitle" || (p.type === "" && p.idx !== "");

function pickLayouts(all: LayoutInfo[]) {
  const find = (types: string[], names: RegExp) => all.find((l) => types.includes(l.type)) ?? all.find((l) => names.test(l.name));
  const content = find(["obj"], /title and content/i) ?? all.find((l) => l.phs.some(isTitle) && l.phs.some(isBody)) ?? all[0];
  return {
    title: find(["title"], /title slide/i) ?? content,
    content,
    section: find(["secHead"], /section header/i) ?? content,
  };
}

// ─── Text ─────────────────────────────────────────────────────────────────────

interface Fmt {
  b?: boolean;
  i?: boolean;
  code?: boolean;
  strike?: boolean;
  underline?: boolean;
  size?: number;
}

const rPr = (f: Fmt) =>
  `<a:rPr lang="en-US"${f.size ? ` sz="${f.size}"` : ""}${f.b ? ' b="1"' : ""}${f.i ? ' i="1"' : ""}${f.strike ? ' strike="sngStrike"' : ""}${f.underline ? ' u="sng"' : ""} dirty="0">${f.code ? '<a:latin typeface="Courier New"/><a:cs typeface="Courier New"/>' : ""}</a:rPr>`;
const run = (value: string, f: Fmt) => `<a:r>${rPr(f)}<a:t>${esc(value)}</a:t></a:r>`;

interface Ctx {
  resolve: (text: string) => string;
  pictures: Array<{ pic: Picture; alt: string }>;
  tables: any[];
  pending: Array<Promise<void>>;
}

function runs(nodes: any[], ctx: Ctx, f: Fmt = {}): string {
  return nodes
    .map((n): string => {
      switch (n.type) {
        case "text":
          return run(ctx.resolve(n.value.replace(/\s*\n\s*/g, " ")), f);
        case "strong":
        case "highlight":
          return runs(n.children, ctx, { ...f, b: true });
        case "emphasis":
          return runs(n.children, ctx, { ...f, i: true });
        case "delete":
          return runs(n.children, ctx, { ...f, strike: true });
        case "underline":
          return runs(n.children, ctx, { ...f, underline: true });
        case "inlineCode":
          return run(n.value, { ...f, code: true });
        case "inlineMath":
          return run(n.value, { ...f, i: true });
        case "break":
          return "<a:br/>";
        case "image": {
          ctx.pending.push(pictureFrom(n.url).then((pic) => void (pic && ctx.pictures.push({ pic, alt: n.alt ?? "" }))));
          return "";
        }
        default:
          return n.children ? runs(n.children, ctx, f) : n.value ? run(String(n.value), f) : "";
      }
    })
    .join("");
}

interface P {
  runs: string;
  lvl?: number;
  bullet?: "none" | "num";
  align?: "ctr";
  size?: number;
}

const paraXml = (p: P) => {
  const pPr = `<a:pPr${p.lvl ? ` lvl="${p.lvl}"` : ""}${p.align ? ` algn="${p.align}"` : ""}>${p.bullet === "none" ? "<a:buNone/>" : p.bullet === "num" ? '<a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"/>' : ""}</a:pPr>`;
  return `<a:p>${pPr}${p.runs || '<a:endParaRPr lang="en-US"/>'}</a:p>`;
};

/** Slide blocks as paragraphs for the body placeholder; tables and pictures go to ctx. */
function paragraphs(nodes: any[], ctx: Ctx, lvl = 0): P[] {
  const out: P[] = [];
  const caption = (d: any) => (d?.displayText || d?.caption ? [{ runs: run([d.displayText, d.caption].filter(Boolean).join(": "), { i: true, size: 1400 }), bullet: "none" as const }] : []);
  for (const n of nodes) {
    const d = n.data ?? {};
    switch (n.type) {
      case "heading":
        out.push({ runs: runs(n.children, ctx, { b: true }), bullet: "none" });
        break;
      case "vfmCallout":
        out.push({ runs: runs(n.children[0].children, ctx, { b: true, size: 6000 }), bullet: "none", align: "ctr" });
        out.push({ runs: runs(n.children[1].children, ctx), bullet: "none", align: "ctr" });
        break;
      case "paragraph": {
        if (n.children.length === 1 && n.children[0].type === "image") {
          runs(n.children, ctx);
          out.push(...caption(n.children[0].data));
        } else out.push({ runs: runs(n.children, ctx), bullet: "none", lvl });
        break;
      }
      case "list":
        n.children.forEach((item: any) => {
          const kids = item.children;
          const first = kids.find((c: any) => c.type === "paragraph");
          const mark = item.checked === true ? "☑ " : item.checked === false ? "☐ " : "";
          out.push({ runs: (mark ? run(mark, {}) : "") + runs(first?.children ?? [], ctx), lvl, bullet: n.ordered ? "num" : undefined });
          for (const c of kids) if (c !== first) out.push(...paragraphs([c], ctx, lvl + 1));
        });
        break;
      case "code":
        out.push(...caption(d));
        for (const line of n.value.replace(/\n$/, "").split("\n")) out.push({ runs: run(line || " ", { code: true, size: 1200 }), bullet: "none" });
        break;
      case "algorithmBlock":
      case "musicBlock":
        out.push(...caption(n));
        for (const line of String(n.value ?? n.notation).replace(/\n$/, "").split("\n")) out.push({ runs: run(line || " ", { code: true, size: 1200 }), bullet: "none" });
        break;
      case "mermaidBlock":
        ctx.pending.push(mermaidPicture(n.source).then((pic) => void (pic && ctx.pictures.push({ pic, alt: n.caption ?? "diagram" }))));
        out.push(...caption(n));
        break;
      case "math":
        out.push({ runs: run(n.value.replace(/\n/g, " "), { i: true }), bullet: "none", align: "ctr" });
        break;
      case "blockquote":
        out.push(...paragraphs(n.children, ctx, lvl).map((p) => ({ ...p, bullet: "none" as const })));
        break;
      case "fencedDiv":
        out.push({ runs: run([n.displayText ?? n.envType, n.name ? ` (${n.name})` : ""].join(""), { b: true }), bullet: "none" });
        out.push(...paragraphs(n.children, ctx, lvl));
        break;
      case "table":
        ctx.tables.push(n);
        out.push(...caption(d));
        break;
      default:
        if (n.children) out.push(...paragraphs(n.children, ctx, lvl));
    }
  }
  return out;
}

// ─── Shapes ───────────────────────────────────────────────────────────────────

let shapeId = 2;

function placeholder(attrs: string, name: string, paras: string[], box?: Box): string {
  const id = shapeId++;
  const xfrm = box ? `<a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.w}" cy="${box.h}"/></a:xfrm>` : "";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)} ${id}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph${attrs}/></p:nvPr></p:nvSpPr><p:spPr>${xfrm}</p:spPr><p:txBody><a:bodyPr><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras.join("")}</p:txBody></p:sp>`;
}

function picture(rid: string, box: Box, alt: string): string {
  const id = shapeId++;
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}" descr="${esc(alt)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.w}" cy="${box.h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

function tableShape(table: any, ctx: Ctx, box: Box): string {
  const id = shapeId++;
  const cols = Math.max(...table.children.map((r: any) => r.children.length), 1);
  const rowH = Math.min(370840, Math.floor(box.h / table.children.length));
  const rows = table.children
    .map(
      (row: any, r: number) =>
        `<a:tr h="${rowH}">${row.children
          .map((cell: any, c: number) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr${table.align?.[c] === "center" ? ' algn="ctr"' : table.align?.[c] === "right" ? ' algn="r"' : ""}/>${runs(cell.children, ctx, { b: r === 0, size: 1400 })}</a:p></a:txBody><a:tcPr/></a:tc>`)
          .join("")}</a:tr>`
    )
    .join("");
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.w}" cy="${rowH * table.children.length}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${Array.from({ length: cols }, () => `<a:gridCol w="${Math.floor(box.w / cols)}"/>`).join("")}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

const fit = (pic: Picture, box: Box): Box => {
  const w0 = pic.width * EMU_PER_PX;
  const h0 = pic.height * EMU_PER_PX;
  const k = Math.min(box.w / w0, box.h / h0, 1.6);
  const w = Math.round(w0 * k);
  const h = Math.round(h0 * k);
  return { x: box.x + Math.round((box.w - w) / 2), y: box.y + Math.round((box.h - h) / 2), w, h };
};


// ─── Built-in template ────────────────────────────────────────────────────────

const XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NSALL = `xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"`;
const grp = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const xf = (x: number, y: number, w: number, h: number) => `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;
const ph = (id: number, name: string, attrs: string, box: string, body = "") =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph${attrs}/></p:nvPr></p:nvSpPr><p:spPr>${box}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle>${body}</a:lstStyle><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;
const layoutXml = (name: string, type: string, shapes: string) =>
  `${XMLH}<p:sldLayout ${NSALL} type="${type}" preserve="1"><p:cSld name="${name}"><p:spTree>${grp}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

/** A plain 16:9 template: master, three layouts, theme. Used when the YAML header names none. */
async function builtInTemplate(): Promise<JSZip> {
  const W = 12192000;
  const H = 6858000;
  const zip = new JSZip();
  const lvl = (n: number, mar: number, sz: number, bullet: boolean) =>
    `<a:lvl${n}pPr marL="${mar}" indent="${bullet ? -285750 : 0}" algn="l"><a:spcBef><a:spcPts val="600"/></a:spcBef>${bullet ? '<a:buFont typeface="Arial"/><a:buChar char="&#8226;"/>' : "<a:buNone/>"}<a:defRPr sz="${sz}"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl${n}pPr>`;
  zip.file("[Content_Types].xml", `${XMLH}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>${[1, 2, 3].map((n) => `<Override PartName="/ppt/slideLayouts/slideLayout${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`).join("")}<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>`);
  zip.file("_rels/.rels", `${XMLH}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  zip.file("ppt/presentation.xml", `${XMLH}<p:presentation ${NSALL}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `${XMLH}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${REL}/theme" Target="theme/theme1.xml"/></Relationships>`);
  zip.file(
    "ppt/slideMasters/slideMaster1.xml",
    `${XMLH}<p:sldMaster ${NSALL}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${grp}${ph(2, "Title Placeholder 1", ' type="title"', xf(609600, 365125, 10972800, 1325563))}${ph(3, "Text Placeholder 2", ' type="body" idx="1"', xf(609600, 1825625, 10972800, 4351338))}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst>${[1, 2, 3].map((n) => `<p:sldLayoutId id="${2147483648 + n}" r:id="rId${n}"/>`).join("")}</p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="4000" b="1"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle>${lvl(1, 285750, 2800, true)}${lvl(2, 742950, 2400, true)}${lvl(3, 1200150, 2000, true)}${lvl(4, 1657350, 1800, true)}${lvl(5, 2114550, 1800, true)}</p:bodyStyle><p:otherStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:otherStyle></p:txStyles></p:sldMaster>`
  );
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", `${XMLH}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[1, 2, 3].map((n) => `<Relationship Id="rId${n}" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout${n}.xml"/>`).join("")}<Relationship Id="rId4" Type="${REL}/theme" Target="../theme/theme1.xml"/></Relationships>`);
  zip.file("ppt/slideLayouts/slideLayout1.xml", layoutXml("Title Slide", "title", ph(2, "Title 1", ' type="ctrTitle"', xf(1524000, 1122363, 9144000, 2387600), '<a:lvl1pPr algn="ctr"><a:defRPr sz="6000"/></a:lvl1pPr>') + ph(3, "Subtitle 2", ' type="subTitle" idx="1"', xf(1524000, 3602038, 9144000, 1655762), '<a:lvl1pPr marL="0" indent="0" algn="ctr"><a:buNone/><a:defRPr sz="2400"/></a:lvl1pPr>')));
  zip.file("ppt/slideLayouts/slideLayout2.xml", layoutXml("Title and Content", "obj", ph(2, "Title 1", ' type="title"', xf(609600, 365125, 10972800, 1325563)) + ph(3, "Content Placeholder 2", ' idx="1"', xf(609600, 1825625, 10972800, 4351338))));
  zip.file("ppt/slideLayouts/slideLayout3.xml", layoutXml("Section Header", "secHead", ph(2, "Title 1", ' type="title"', xf(831850, 1709738, 10515600, 2852737), '<a:lvl1pPr><a:defRPr sz="5400"/></a:lvl1pPr>') + ph(3, "Text Placeholder 2", ' type="body" idx="1"', xf(831850, 4589463, 10515600, 1500187), '<a:lvl1pPr marL="0" indent="0"><a:buNone/><a:defRPr sz="2400"/></a:lvl1pPr>')));
  for (const n of [1, 2, 3]) zip.file(`ppt/slideLayouts/_rels/slideLayout${n}.xml.rels`, `${XMLH}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
  const clr = (n: string, v: string) => `<a:${n}><a:srgbClr val="${v}"/></a:${n}>`;
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const ln = (w: number) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr">${fill}<a:prstDash val="solid"/></a:ln>`;
  zip.file(
    "ppt/theme/theme1.xml",
    `${XMLH}<a:theme xmlns:a="${NS_A}" name="vfm"><a:themeElements><a:clrScheme name="vfm"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>${clr("dk2", "1F2937")}${clr("lt2", "F3F4F6")}${["2563EB", "DC2626", "16A34A", "D97706", "7C3AED", "0891B2"].map((c, i) => clr(`accent${i + 1}`, c)).join("")}${clr("hlink", "2563EB")}${clr("folHlink", "7C3AED")}</a:clrScheme><a:fontScheme name="vfm"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="vfm"><a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst><a:lnStyleLst>${ln(6350)}${ln(12700)}${ln(19050)}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`
  );
  return zip;
}

// ─── Entry ────────────────────────────────────────────────────────────────────

export async function exportPptx(state: UpdateMessage, templateBase64?: string): Promise<string> {
  const zip = (await load(templateBase64)) ?? (await builtInTemplate());
  const presPath = "ppt/presentation.xml";
  let pres = await text(zip, presPath);
  if (!pres) throw new Error("The template is not a PowerPoint file (no ppt/presentation.xml).");
  const relsPath = "ppt/_rels/presentation.xml.rels";
  let rels = (await text(zip, relsPath))!;
  let types = (await text(zip, "[Content_Types].xml"))!;

  const sz = /<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(pres);
  const W = Number(sz?.[1] ?? 12192000);
  const H = Number(sz?.[2] ?? 6858000);

  // Remove the template's sample slides (and their notes).
  for (const m of [...rels.matchAll(/<Relationship [^>]*Type="[^"]*\/slide"[^>]*\/>/g)]) {
    const target = attr(m[0], "Target");
    const slidePath = "ppt/" + target.replace(/^\.?\//, "");
    const slideRels = await text(zip, slidePath.replace(/([^/]+)$/, "_rels/$1.rels"));
    for (const n of slideRels?.matchAll(/Target="\.\.\/(notesSlides\/[^"]+)"/g) ?? []) {
      zip.remove(`ppt/${n[1]}`);
      zip.remove(`ppt/notesSlides/_rels/${n[1].split("/")[1]}.rels`);
      types = types.replace(new RegExp(`<Override[^>]*PartName="/ppt/${n[1]}"[^>]*/>`), "");
    }
    zip.remove(slidePath);
    zip.remove(slidePath.replace(/([^/]+)$/, "_rels/$1.rels"));
    types = types.replace(new RegExp(`<Override[^>]*PartName="/${slidePath}"[^>]*/>`), "");
    rels = rels.replace(m[0], "");
  }
  pres = pres.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>|<p:sldIdLst\/>/, "");

  const layouts = await readLayouts(zip);
  if (layouts.length === 0) throw new Error("The template has no slide layouts.");
  const chosen = pickLayouts(layouts);
  const hasNotesMaster = !!zip.file("ppt/notesMasters/notesMaster1.xml");

  const deck = buildSlideDeck(state.text, { sourceMap: state.sourceMap, maxHeadings: state.options.maxHeadings });
  const registry = deck.render.registry;
  const refs = (t: string) => t.replace(new RegExp(XREF_RE.source, "g"), (m, ...g) => {
    const label = g.find((x) => typeof x === "string" && x.includes(":")) ?? m.slice(2, -1);
    return registry.get(label)?.displayText ?? m;
  });
  // @cite(key) becomes "(Author, Year)" from the bibliography file, as in the preview.
  const resolve = (t: string) =>
    refs(t).replace(new RegExp(CITE_RE_SOURCE, "g"), (m, group: string) => {
      const keys = splitCiteKeys(group);
      const names = keys.map((k) => (state.bib?.[k] ? formatReference(state.bib[k]).authorYear : k));
      return `(${names.join("; ")})`;
    });

  let relNo = Math.max(0, ...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]))) + 1;
  const slideIds: string[] = [];
  const media = new Map<string, Picture>();
  let mediaCount = 0;

  const slides = deck.slides;
  for (let i = 0; i < slides.length; i++) {
    shapeId = 2;
    const slide: Slide = slides[i];
    const layout = slide.cover ? chosen.title : slide.divider && slide.body.length <= 1 ? chosen.section : chosen.content;
    const ctx: Ctx = { resolve, pictures: [], tables: [], pending: [] };
    const shapes: string[] = [];
    const slideRels: string[] = [`<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/${layout.path.split("/").pop()}"/>`];
    const titlePh = layout.phs.find(isTitle);
    const bodyPh = layout.phs.find((p) => isBody(p) && !isTitle(p));
    const area: Box = bodyPh?.box ?? { x: Math.round(W * 0.08), y: Math.round(H * 0.24), w: Math.round(W * 0.84), h: Math.round(H * 0.64) };

    if (slide.cover) {
      const c = slide.cover;
      if (titlePh) shapes.push(placeholder(titlePh.attrs, "Title", [paraXml({ runs: run(c.title, {}) })]));
      const sub = [c.subtitle, c.authors.map((a) => a.name).join(", "), c.date].filter(Boolean) as string[];
      if (bodyPh && sub.length) shapes.push(placeholder(bodyPh.attrs, "Subtitle", sub.map((t) => paraXml({ runs: run(t, {}), bullet: "none" }))));
    } else {
      let title = runs(slide.title as any[], ctx);
      if (slide.continuation.of > 1) title += run(` (${slide.continuation.index}/${slide.continuation.of})`, {});
      if (titlePh) shapes.push(placeholder(titlePh.attrs, "Title", [paraXml({ runs: title })]));
      const paras = paragraphs(slide.body as any[], ctx);
      paragraphs(slide.images as any[], ctx).forEach((p) => paras.push(p));
      if (slide.leadin?.length) paras.push({ runs: runs(slide.leadin as any[], ctx, { i: true }), bullet: "none" });
      await Promise.all(ctx.pending);

      const hasPics = ctx.pictures.length > 0;
      const hasTables = ctx.tables.length > 0;
      const hasText = paras.length > 0 && paras.some((p) => p.runs);
      let textBox = area;
      let picBox: Box | undefined;
      let tableBox: Box | undefined;
      if (hasPics && hasText) {
        const gap = Math.round(area.w * 0.04);
        const half = Math.round((area.w - gap) / 2);
        const picsLeft = slide.layout === "rtext";
        textBox = { ...area, x: picsLeft ? area.x + half + gap : area.x, w: half };
        picBox = { ...area, x: picsLeft ? area.x : area.x + half + gap, w: half };
      } else if (hasPics) picBox = area;
      if (hasTables) {
        const textH = hasText ? Math.round(area.h * 0.35) : 0;
        textBox = { ...textBox, h: textH || textBox.h };
        tableBox = { ...area, y: area.y + textH, h: area.h - textH };
      }
      if (hasText && bodyPh) shapes.push(placeholder(bodyPh.attrs, "Content", paras.map(paraXml), hasPics || hasTables ? textBox : undefined));
      if (picBox) {
        const each = Math.floor(picBox.h / ctx.pictures.length);
        ctx.pictures.forEach(({ pic, alt }, k) => {
          const key = `${pic.ext}:${mediaCount}`;
          const name = `vfmimage${++mediaCount}.${pic.ext === "jpeg" ? "jpg" : pic.ext}`;
          media.set(name, pic);
          void key;
          const rid = `rId${slideRels.length + 1}`;
          slideRels.push(`<Relationship Id="${rid}" Type="${REL}/image" Target="../media/${name}"/>`);
          shapes.push(picture(rid, fit(pic, { ...picBox!, y: picBox!.y + k * each, h: each }), alt));
        });
      }
      if (tableBox) for (const t of ctx.tables) shapes.push(tableShape(t, ctx, tableBox));
    }

    if (hasNotesMaster && slide.notes.length > 0) {
      const n = i + 1;
      const notes = slide.notes.map((note) => `<a:p>${runs(note as any[], ctx)}</a:p>`).join("");
      zip.file(
        `ppt/notesSlides/notesSlide${n}.xml`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${notes}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`
      );
      zip.file(`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/notesMaster" Target="../notesMasters/notesMaster1.xml"/><Relationship Id="rId2" Type="${REL}/slide" Target="../slides/slide${n}.xml"/></Relationships>`);
      slideRels.push(`<Relationship Id="rId${slideRels.length + 1}" Type="${REL}/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/>`);
      types = types.replace("</Types>", `<Override PartName="/ppt/notesSlides/notesSlide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/></Types>`);
    }

    const n = i + 1;
    zip.file(
      `ppt/slides/slide${n}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
    );
    zip.file(`ppt/slides/_rels/slide${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slideRels.join("")}</Relationships>`);
    types = types.replace("</Types>", `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
    const rid = `rId${relNo++}`;
    rels = rels.replace("</Relationships>", `<Relationship Id="${rid}" Type="${REL}/slide" Target="slides/slide${n}.xml"/></Relationships>`);
    slideIds.push(`<p:sldId id="${256 + i}" r:id="${rid}"/>`);
  }

  for (const [name, pic] of media) zip.file(`ppt/media/${name}`, pic.bytes);
  for (const ext of new Set([...media.values()].map((p) => p.ext))) types = ensureDefault(types, ext === "jpeg" ? "jpg" : ext, IMAGE_MIME[ext]);
  // A .potx names its main part as a template; once saved as .pptx it must be a presentation.
  types = types.replace("presentationml.template.main+xml", "presentationml.presentation.main+xml");
  const list = `<p:sldIdLst>${slideIds.join("")}</p:sldIdLst>`;
  pres = /<p:sldSz/.test(pres) ? pres.replace(/<p:sldSz/, `${list}<p:sldSz`) : pres.replace("</p:presentation>", `${list}</p:presentation>`);
  zip.file(presPath, pres);
  zip.file(relsPath, rels);
  zip.file("[Content_Types].xml", types);
  return toBase64(zip);
}
