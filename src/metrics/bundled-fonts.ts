/** Packaged face paths. Shared by measure, SVG raster, and PDF embed. */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";

const LATIN_REGULAR = "LiberationSans-Regular.ttf";
const LATIN_BOLD = "LiberationSans-Bold.ttf";
const CJK_FULL = "VivaSansCJK.ttf";

function fontRoots(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(process.cwd(), "assets/fonts"),
    join(here, "../../assets/fonts"),
    join(here, "../../../assets/fonts"),
    join(here, "../assets/fonts"),
  ];
}

function firstExisting(name: string): string | null {
  for (const root of fontRoots()) {
    const path = join(root, name);
    if (existsSync(path)) return path;
  }
  return null;
}

export function bundledLatinRegularPath(): string | null {
  return firstExisting(LATIN_REGULAR);
}

export function bundledLatinBoldPath(): string | null {
  return firstExisting(LATIN_BOLD);
}

export function bundledLatinFontPath(bold = false): string | null {
  return bold ? bundledLatinBoldPath() ?? bundledLatinRegularPath() : bundledLatinRegularPath();
}

export function bundledCjkFullPath(): string | null {
  return firstExisting(CJK_FULL);
}

export const BUNDLED_LATIN_FAMILY = "Liberation Sans";
/** Internal family name of `VivaSansCJK.ttf` (Droid Sans Fallback Full). */
export const BUNDLED_CJK_FAMILY = "Droid Sans Fallback";

type AdvanceFont = {
  unitsPerEm: number;
  layout: (text: string) => { advanceWidth: number };
  glyphForCodePoint?: (cp: number) => { advanceWidth: number };
};
const faceCache = new Map<string, AdvanceFont | null>();

/** Node-only. Browser stub returns null and measure falls back to Helvetica AFM. */
export function readBundledLatinFace(bold = false): AdvanceFont | null {
  const path = bundledLatinFontPath(bold);
  if (!path) return null;
  if (faceCache.has(path)) return faceCache.get(path)!;
  try {
    const font = fontkit.create(readFileSync(path)) as AdvanceFont;
    faceCache.set(path, font);
    return font;
  } catch {
    faceCache.set(path, null);
    return null;
  }
}
