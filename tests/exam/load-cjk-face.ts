import { existsSync, readFileSync } from "node:fs";
import type { Page } from "puppeteer-core";
import { bundledCjkFontPath } from "../../src/export/pdf-font.js";

/** Same face the PDF embedder uses. CI Chrome has no system CJK. */
export const CJK_FACE = "VivaSansCJK";

export async function injectBundledCjkFace(page: Page): Promise<boolean> {
  const path = bundledCjkFontPath();
  if (!path || !existsSync(path)) return false;
  const b64 = readFileSync(path).toString("base64");
  await page.addStyleTag({
    content: `@font-face{font-family:${CJK_FACE};src:url(data:font/ttf;base64,${b64}) format('truetype');font-weight:400;font-style:normal;}`,
  });
  await page.evaluate(async (face: string) => {
    await document.fonts.load(`16px "${face}"`);
    await document.fonts.ready;
  }, CJK_FACE);
  return true;
}

export function withCjkFallback(stack: string): string {
  if (stack.includes(CJK_FACE)) return stack;
  return `${stack}, ${CJK_FACE}`;
}
