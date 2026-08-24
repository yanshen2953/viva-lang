export type CjkFontResolveOpts = { fontPath?: string };
export type PdfTextFonts = { latin: never; rich: never; hasCjk: boolean };

export function bundledCjkFontPath(): string | null {
  return null;
}

export function resolveCjkFontPath(_opts?: CjkFontResolveOpts): string | null {
  return null;
}

export async function embedPdfFonts(): Promise<PdfTextFonts> {
  throw new Error("PDF fonts require the Node runtime");
}

export function pickPdfFont(): never {
  throw new Error("PDF fonts require the Node runtime");
}

export function pdfTextWidth(_font: unknown, text: string, size: number): number {
  return text.length * size * 0.55;
}

export function pdfSafeText(_font: unknown, text: string): string {
  return text;
}

export function pdfMissingGlyphs(_font: unknown, _text: string): string[] {
  return [];
}

export function pdfUnmappedGlyphs(_text: string, _opts?: CjkFontResolveOpts): string[] {
  return [];
}
