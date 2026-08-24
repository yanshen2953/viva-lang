import type { VisualIR } from "../ir.js";

export type VectorPdfOptions = {
  scale?: number;
  cjkFontPath?: string;
  missingGlyphs?: string[];
};

/** Browser embed has no fontkit / pdf-lib font files. Call this only on Node. */
export async function renderVectorPdfFromIr(
  _ir: VisualIR,
  _opts: VectorPdfOptions = {},
): Promise<Uint8Array> {
  throw new Error("vector PDF export requires the Node runtime");
}
