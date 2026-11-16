/** Small helpers shared by the Word and PowerPoint writers. */

import JSZip from "jszip";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const EMU_PER_PX = 9525;

export async function load(base64: string | undefined): Promise<JSZip | undefined> {
  return base64 ? JSZip.loadAsync(base64, { base64: true }) : undefined;
}

export async function text(zip: JSZip, path: string): Promise<string | undefined> {
  return zip.file(path)?.async("string");
}

export interface Picture {
  bytes: Uint8Array;
  ext: "png" | "jpeg" | "gif";
  width: number;
  height: number;
}

const MIME_EXT: Record<string, Picture["ext"] | undefined> = { "image/png": "png", "image/jpeg": "jpeg", "image/jpg": "jpeg", "image/gif": "gif" };

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function size(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 300 });
    img.onerror = () => reject(new Error("image could not be read"));
    img.src = url;
  });
}

/** A picture from a data: URI (the host inlines local images before exporting). Other URLs are skipped. */
export async function pictureFrom(url: string): Promise<Picture | undefined> {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);
  if (!m) return undefined;
  try {
    if (m[1] === "image/svg+xml" || !MIME_EXT[m[1]]) return rasterize(url, m);
    return { bytes: decode(m[3]), ext: MIME_EXT[m[1]]!, ...(await size(url)) };
  } catch {
    return undefined;
  }
}

async function rasterize(url: string, _m: RegExpExecArray): Promise<Picture | undefined> {
  return svgToPicture(url);
}

/** Draws an SVG (as a data: URL) onto a canvas and returns it as a PNG. */
export async function svgToPicture(svgUrl: string, scale = 2): Promise<Picture | undefined> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("svg could not be drawn"));
    img.src = svgUrl;
  });
  const width = img.naturalWidth || 800;
  const height = img.naturalHeight || 600;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL("image/png").split(",")[1];
  return { bytes: decode(png), ext: "png", width, height };
}

export const svgDataUrl = (svg: string) => "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));

/** Registers `ext` in [Content_Types].xml if it is missing. */
export function ensureDefault(types: string, ext: string, mime: string): string {
  if (new RegExp(`<Default[^>]+Extension="${ext}"`, "i").test(types)) return types;
  return types.replace("</Types>", `<Default Extension="${ext}" ContentType="${mime}"/></Types>`);
}

export const IMAGE_MIME: Record<Picture["ext"], string> = { png: "image/png", jpeg: "image/jpeg", gif: "image/gif" };

export const toBase64 = (zip: JSZip) => zip.generateAsync({ type: "base64", compression: "DEFLATE" });
