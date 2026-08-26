import { existsSync, readFileSync } from "node:fs";
import type { Page } from "puppeteer-core";
import { bundledCjkFontPath } from "../../src/export/pdf-font.js";
import { bundledLatinBoldPath, bundledLatinRegularPath } from "../../src/metrics/bundled-fonts.js";
import { LATIN_FONT_STACK } from "../../src/metrics/text.js";

/** Same faces the PDF embedder and resvg compare use. */
export const CJK_FACE = "Droid Sans Fallback";
export const LATIN_FACE = "Liberation Sans";

async function injectFace(page: Page, family: string, path: string | null, weight: number): Promise<boolean> {
  if (!path || !existsSync(path)) return false;
  const b64 = readFileSync(path).toString("base64");
  await page.addStyleTag({
    content: `@font-face{font-family:"${family}";src:url(data:font/ttf;base64,${b64}) format('truetype');font-weight:${weight};font-style:normal;}`,
  });
  await page.evaluate(
    async (face: string, w: number) => {
      await document.fonts.load(`${w} 16px "${face}"`);
      await document.fonts.ready;
    },
    family,
    weight,
  );
  return true;
}

export async function injectBundledCjkFace(page: Page): Promise<boolean> {
  await injectFace(page, LATIN_FACE, bundledLatinRegularPath(), 400);
  await injectFace(page, LATIN_FACE, bundledLatinBoldPath(), 700);
  return injectFace(page, CJK_FACE, bundledCjkFontPath(), 400);
}

export function withCjkFallback(stack: string): string {
  const faces = [LATIN_FACE, stack, CJK_FACE].filter(Boolean);
  return [...new Set(faces.flatMap((s) => s.split(",").map((p) => p.trim())))].join(", ");
}

export function examFontStack(): string {
  return withCjkFallback(LATIN_FONT_STACK);
}
