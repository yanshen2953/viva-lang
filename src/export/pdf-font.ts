import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFName, StandardFonts, type PDFFont, type PDFRef } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { missingGlyphsInFont } from "../metrics/glyphs.js";

const BUNDLED_FULL = "VivaSansCJK.ttf";
const BUNDLED_SUBSET = "VivaSansFallback.ttf";

const SYSTEM_CJK_CANDIDATES = [
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
  "/usr/share/fonts/truetype/noto/NotoSansSC-Regular.otf",
  "/usr/share/fonts/opentype/source-han-sans/SourceHanSansSC-Regular.otf",
  "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
  "/usr/share/fonts/truetype/droid/DroidSansFallback.ttf",
  "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
];

export type CjkFontResolveOpts = {
  /** Host TTF/OTF. Wins over `VIVA_PDF_CJK_FONT` and the bundled library. */
  fontPath?: string;
};

export type PdfTextFonts = {
  latin: PDFFont;
  rich: PDFFont;
  hasCjk: boolean;
};

function bundledCjkCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const names = [BUNDLED_FULL, BUNDLED_SUBSET];
  const roots = [
    join(process.cwd(), "assets/fonts"),
    join(here, "../../assets/fonts"),
    join(here, "../../../assets/fonts"),
    join(here, "../assets/fonts"),
  ];
  return names.flatMap((name) => roots.map((root) => join(root, name)));
}

/** Packaged full CJK library (not the leftover subset). */
export function bundledCjkFontPath(): string | null {
  for (const path of bundledCjkCandidates()) {
    if (path.endsWith(BUNDLED_FULL) && existsSync(path)) return path;
  }
  return null;
}

/**
 * First readable CJK TTF: host path, then `VIVA_PDF_CJK_FONT`, then the
 * bundled full library, then system fonts, then the leftover subset.
 * Missing files fall through. Not a language keyword — export fidelity only.
 */
export function resolveCjkFontPath(opts?: CjkFontResolveOpts): string | null {
  const candidates = [
    opts?.fontPath,
    process.env.VIVA_PDF_CJK_FONT,
    ...bundledCjkCandidates().filter((path) => path.endsWith(BUNDLED_FULL)),
    ...SYSTEM_CJK_CANDIDATES,
    ...bundledCjkCandidates().filter((path) => path.endsWith(BUNDLED_SUBSET)),
  ];
  for (const path of candidates) {
    if (path && existsSync(path)) return path;
  }
  return null;
}

export async function embedPdfFonts(
  pdf: PDFDocument,
  opts?: CjkFontResolveOpts,
): Promise<PdfTextFonts> {
  pdf.registerFontkit(fontkit);
  const latin = await pdf.embedFont(StandardFonts.Helvetica);
  const path = resolveCjkFontPath(opts);
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

export type PdfTextRun = { text: string; font: PDFFont };

/**
 * Split mixed text so Latin-1 keeps Helvetica and wide script uses the CJK
 * face. Drawing one run per face keeps PDF advances equal to the layout and
 * browser rulers; one face for the whole string widened Latin inside CJK.
 */
export function pdfTextRuns(fonts: PdfTextFonts, text: string): PdfTextRun[] {
  if (!text) return [];
  if (!fonts.hasCjk) return [{ text: pdfSafeText(fonts.latin, text), font: fonts.latin }];
  const runs: PdfTextRun[] = [];
  for (const ch of text) {
    const font = /[^\u0000-\u00FF]/.test(ch) ? fonts.rich : fonts.latin;
    const last = runs[runs.length - 1];
    if (last && last.font === font) last.text += ch;
    else runs.push({ text: ch, font });
  }
  return runs.map((run) => ({ text: pdfSafeText(run.font, run.text), font: run.font }));
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

/** Characters the embedded font cannot measure. Used for export warnings. */
export function pdfMissingGlyphs(font: PDFFont, text: string): string[] {
  const missing: string[] = [];
  for (const ch of text) {
    try {
      font.widthOfTextAtSize(ch, 10);
    } catch {
      missing.push(ch);
    }
  }
  return missing;
}

/**
 * CJK / non-Latin coverage via fontkit cmap, not widthOfTextAtSize.
 * `.notdef` glyphs that still return a width are reported missing.
 */
export function pdfUnmappedGlyphs(text: string, opts?: CjkFontResolveOpts): string[] {
  return missingGlyphsInFont(resolveCjkFontPath(opts), text);
}

/**
 * Write a ToUnicode CMap so extractors can recover CJK from subset CIDs.
 * Call after every `drawText`, before `pdf.save()`.
 */
export function attachCjkToUnicode(pdf: PDFDocument, font: PDFFont, text: string): void {
  const chars = [...new Set([...text])].filter((ch) => (ch.codePointAt(0) ?? 0) > 0xff);
  if (!chars.length) return;
  const pairs: string[] = [];
  for (const ch of chars) {
    try {
      const encoded = font.encodeText(ch);
      const cid = [...encoded.asBytes()].map((b) => b.toString(16).padStart(2, "0")).join("");
      const cp = ch.codePointAt(0)!;
      const uni = cp.toString(16).toUpperCase().padStart(cp > 0xffff ? 8 : 4, "0");
      pairs.push(`<${cid.toUpperCase()}> <${uni}>`);
    } catch {
      /* unmapped */
    }
  }
  if (!pairs.length) return;
  const chunks: string[] = [];
  for (let i = 0; i < pairs.length; i += 100) {
    const slice = pairs.slice(i, i + 100);
    chunks.push(`${slice.length} beginbfchar\n${slice.join("\n")}\nendbfchar`);
  }
  const cmap = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${chunks.join("\n")}
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
  const ref = (font as PDFFont & { ref?: PDFRef }).ref;
  if (!ref) return;
  const dict = pdf.context.lookup(ref);
  if (!dict || !("set" in dict)) return;
  const stream = pdf.context.stream(cmap);
  (dict as { set: (n: ReturnType<typeof PDFName.of>, v: unknown) => void }).set(
    PDFName.of("ToUnicode"),
    stream,
  );
}
