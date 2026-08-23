import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const BUNDLED_NAME = "VivaSansFallback.ttf";

const SYSTEM_CJK_CANDIDATES = [
  process.env.VIVA_PDF_CJK_FONT,
  "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
  "/usr/share/fonts/truetype/droid/DroidSansFallback.ttf",
  "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
].filter((p): p is string => Boolean(p));

export type PdfTextFonts = {
  latin: PDFFont;
  rich: PDFFont;
  hasCjk: boolean;
};

function bundledCjkCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(process.cwd(), "assets/fonts", BUNDLED_NAME),
    join(here, "../../assets/fonts", BUNDLED_NAME),
    join(here, "../../../assets/fonts", BUNDLED_NAME),
    join(here, "../assets/fonts", BUNDLED_NAME),
  ];
}

/** First readable CJK TTF: env override, bundled subset, then system fonts. */
export function resolveCjkFontPath(): string | null {
  for (const path of [...bundledCjkCandidates(), ...SYSTEM_CJK_CANDIDATES]) {
    if (path && existsSync(path)) return path;
  }
  return null;
}

export async function embedPdfFonts(pdf: PDFDocument): Promise<PdfTextFonts> {
  pdf.registerFontkit(fontkit);
  const latin = await pdf.embedFont(StandardFonts.Helvetica);
  const path = resolveCjkFontPath();
  if (!path) return { latin, rich: latin, hasCjk: false };
  try {
    const bytes = readFileSync(path);
    const rich = await pdf.embedFont(bytes, { subset: true });
    return { latin, rich, hasCjk: true };
  } catch {
    return { latin, rich: latin, hasCjk: false };
  }
}

export function pickPdfFont(fonts: PdfTextFonts, text: string): PDFFont {
  return /[^\u0000-\u00FF]/.test(text) && fonts.hasCjk ? fonts.rich : fonts.latin;
}

/** Helvetica throws on CJK; never let measurement crash export. */
export function pdfTextWidth(font: PDFFont, text: string, size: number): number {
  try {
    return font.widthOfTextAtSize(text, size);
  } catch {
    return text.length * size * 0.55;
  }
}

export function pdfSafeText(font: PDFFont, text: string): string {
  try {
    font.widthOfTextAtSize(text, 10);
    return text;
  } catch {
    return text.replace(/[^\u0000-\u00FF]/g, "?");
  }
}
