/** Builds the files the export commands ask for, from the preview's current text. */

import type { ExportFormat, UpdateMessage } from "../protocol";
import { exportDocx } from "./docx";
import { exportPptx } from "./pptx";
import { slidesToMarkdown } from "./slidesMd";

export async function exportDocument(format: ExportFormat, state: UpdateMessage, template?: string): Promise<string> {
  switch (format) {
    case "docx":
      return exportDocx(state, template);
    case "pptx":
      return exportPptx(state, template);
    case "slides-md":
      return btoa(unescape(encodeURIComponent(slidesToMarkdown(state))));
  }
}
