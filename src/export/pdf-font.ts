import { readFileSync, existsSync } from "node:fs";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

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
};

export async function embedPdfFonts(pdf: PDFDocument): Promise<PdfTextFonts> {
  pdf.registerFontkit(fontkit);
  const latin = await pdf.embedFont(StandardFonts.Helvetica);
  const path = SYSTEM_CJK_CANDIDATES.find((p) => existsSync(p));
  if (!path) return { latin, rich: latin };
  try {
    const bytes = readFileSync(path);
    const rich = await pdf.embedFont(bytes, { subset: true });
    return { latin, rich };
  } catch {
    return { latin, rich: latin };
  }
}

export function pickPdfFont(fonts: PdfTextFonts, text: string): PDFFont {
  return /[^\u0000-\u00FF]/.test(text) ? fonts.rich : fonts.latin;
}
