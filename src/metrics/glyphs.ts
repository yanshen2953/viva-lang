import { readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { isWideScript } from "./text.js";

type FontkitFont = {
  hasGlyphForCodePoint?: (codePoint: number) => boolean;
  glyphForCodePoint?: (codePoint: number) => { id?: number } | null;
};

const cache = new Map<string, FontkitFont>();

function loadFont(path: string): FontkitFont | null {
  const hit = cache.get(path);
  if (hit) return hit;
  try {
    const font = fontkit.create(readFileSync(path)) as FontkitFont;
    cache.set(path, font);
    return font;
  } catch {
    return null;
  }
}

function hasGlyph(font: FontkitFont, ch: string): boolean {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return true;
  if (typeof font.hasGlyphForCodePoint === "function") {
    return font.hasGlyphForCodePoint(cp);
  }
  const glyph = font.glyphForCodePoint?.(cp);
  return Boolean(glyph && glyph.id);
}

/**
 * Characters with no cmap entry. Latin (≤ U+00FF) is left to Helvetica.
 * `.notdef` that still returns a width is treated as missing.
 */
export function missingGlyphsInFont(path: string | null, text: string): string[] {
  if (!path) {
    return [...text].filter((ch) => isWideScript(ch) || (ch.codePointAt(0) ?? 0) > 0xff);
  }
  const font = loadFont(path);
  if (!font) {
    return [...text].filter((ch) => isWideScript(ch) || (ch.codePointAt(0) ?? 0) > 0xff);
  }
  const missing: string[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp <= 0xff) continue;
    if (!hasGlyph(font, ch)) missing.push(ch);
  }
  return missing;
}
