/**
 * Shared text measure for layout, structural QA, SVG defaults, and PDF.
 * Latin uses the bundled Liberation Sans TTF (same file PDF embeds).
 * CJK / fullwidth / kana / hangul use 1 em — Droid Sans Fallback CJK
 * advances are unitsPerEm, so this matches the bundled PDF CJK font.
 */

import { readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { BUNDLED_CJK_FAMILY, BUNDLED_LATIN_FAMILY, bundledLatinFontPath } from "./bundled-fonts.js";

export const LATIN_FONT_STACK = `${BUNDLED_LATIN_FAMILY}, Helvetica, Arial, ${BUNDLED_CJK_FAMILY}, sans-serif`;

/** Same split PDF uses: non-Latin-1 goes to the CJK face. */
export function isCjkRunChar(ch: string): boolean {
  return /[^\u0000-\u00FF]/.test(ch);
}

export type ScriptRun = { text: string; wide: boolean };

export function scriptRuns(text: string): ScriptRun[] {
  const runs: ScriptRun[] = [];
  for (const ch of text) {
    const wide = isCjkRunChar(ch);
    const last = runs[runs.length - 1];
    if (last && last.wide === wide) last.text += ch;
    else runs.push({ wide, text: ch });
  }
  return runs;
}

/** Handbook stacks often omit the bundled CJK family name resvg needs. */
export function svgFontStack(requested?: unknown): string {
  const stack = typeof requested === "string" && requested.trim() ? requested.trim() : LATIN_FONT_STACK;
  if (stack.includes(BUNDLED_CJK_FAMILY)) return stack;
  return `${stack}, ${BUNDLED_CJK_FAMILY}`;
}

/** PDF treats weight ≥ 600 as Bold; resvg only maps 700 onto the Bold TTF. */
export function svgFontWeightAttr(weight?: unknown): string | undefined {
  if (weight === undefined || weight === null || weight === "") return undefined;
  return isBoldWeight(weight as number | string) ? "700" : String(weight);
}

const HELVETICA_EM = 1000;

/** Helvetica Regular advances, Adobe AFM / WinAnsi, 1000 units/em. */
const HELVETICA_ADVANCE: Record<string, number> = {
  " ": 278,
  "!": 278,
  '"': 355,
  "#": 556,
  $: 556,
  "%": 889,
  "&": 667,
  "'": 191,
  "(": 333,
  ")": 333,
  "*": 389,
  "+": 584,
  ",": 278,
  "-": 333,
  ".": 278,
  "/": 278,
  "0": 556,
  "1": 556,
  "2": 556,
  "3": 556,
  "4": 556,
  "5": 556,
  "6": 556,
  "7": 556,
  "8": 556,
  "9": 556,
  ":": 278,
  ";": 278,
  "<": 584,
  "=": 584,
  ">": 584,
  "?": 556,
  "@": 1015,
  A: 667,
  B: 667,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 500,
  K: 667,
  L: 556,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
  "[": 278,
  "\\": 278,
  "]": 278,
  "^": 469,
  _: 500,
  "`": 333,
  a: 556,
  b: 556,
  c: 500,
  d: 556,
  e: 556,
  f: 278,
  g: 556,
  h: 556,
  i: 222,
  j: 222,
  k: 500,
  l: 222,
  m: 833,
  n: 556,
  o: 556,
  p: 556,
  q: 556,
  r: 333,
  s: 500,
  t: 278,
  u: 556,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 500,
  "{": 334,
  "|": 260,
  "}": 334,
  "~": 584,
  "\u00a0": 278,
  "¡": 333,
  "¢": 556,
  "£": 556,
  "¤": 556,
  "¥": 556,
  "§": 556,
  "¨": 333,
  "©": 737,
  ª: 370,
  "«": 556,
  "¬": 584,
  "®": 737,
  "¯": 333,
  "°": 400,
  "±": 584,
  "´": 333,
  µ: 556,
  "¶": 537,
  "·": 278,
  "¸": 333,
  "º": 365,
  "»": 556,
  "¿": 611,
  À: 667,
  Á: 667,
  Â: 667,
  Ã: 667,
  Ä: 667,
  Å: 667,
  Æ: 1000,
  Ç: 722,
  È: 667,
  É: 667,
  Ê: 667,
  Ë: 667,
  Ì: 278,
  Í: 278,
  Î: 278,
  Ï: 278,
  Ñ: 722,
  Ò: 778,
  Ó: 778,
  Ô: 778,
  Õ: 778,
  Ö: 778,
  "×": 584,
  Ø: 778,
  Ù: 722,
  Ú: 722,
  Û: 722,
  Ü: 722,
  ß: 611,
  à: 556,
  á: 556,
  â: 556,
  ã: 556,
  ä: 556,
  å: 556,
  æ: 889,
  ç: 500,
  è: 556,
  é: 556,
  ê: 556,
  ë: 556,
  ì: 278,
  í: 278,
  î: 278,
  ï: 278,
  ñ: 556,
  ò: 556,
  ó: 556,
  ô: 556,
  õ: 556,
  ö: 556,
  "÷": 584,
  ø: 611,
  ù: 556,
  ú: 556,
  û: 556,
  ü: 556,
  ÿ: 500,
};

/** Helvetica Bold Regular advances, Adobe AFM / WinAnsi, 1000 units/em. */
const HELVETICA_BOLD_ADVANCE: Record<string, number> = {
  " ": 278,
  "!": 333,
  '"': 474,
  "#": 556,
  $: 556,
  "%": 889,
  "&": 722,
  "'": 238,
  "(": 333,
  ")": 333,
  "*": 389,
  "+": 584,
  ",": 278,
  "-": 333,
  ".": 278,
  "/": 278,
  "0": 556,
  "1": 556,
  "2": 556,
  "3": 556,
  "4": 556,
  "5": 556,
  "6": 556,
  "7": 556,
  "8": 556,
  "9": 556,
  ":": 333,
  ";": 333,
  "<": 584,
  "=": 584,
  ">": 584,
  "?": 611,
  "@": 975,
  A: 722,
  B: 722,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 556,
  K: 722,
  L: 611,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
  "[": 333,
  "\\": 278,
  "]": 333,
  "^": 584,
  _: 556,
  "`": 333,
  a: 556,
  b: 611,
  c: 556,
  d: 611,
  e: 556,
  f: 333,
  g: 611,
  h: 611,
  i: 278,
  j: 278,
  k: 556,
  l: 278,
  m: 889,
  n: 611,
  o: 611,
  p: 611,
  q: 611,
  r: 389,
  s: 556,
  t: 333,
  u: 611,
  v: 556,
  w: 778,
  x: 556,
  y: 556,
  z: 500,
  "{": 389,
  "|": 280,
  "}": 389,
  "~": 584,
  "\u00a0": 278,
  "¡": 333,
  "¢": 556,
  "£": 556,
  "¤": 556,
  "¥": 556,
  "§": 556,
  "¨": 333,
  "©": 737,
  ª: 370,
  "«": 556,
  "¬": 584,
  "®": 737,
  "¯": 333,
  "°": 400,
  "±": 584,
  "´": 333,
  µ: 611,
  "¶": 556,
  "·": 278,
  "¸": 333,
  "º": 365,
  "»": 556,
  "¿": 611,
  À: 722,
  Á: 722,
  Â: 722,
  Ã: 722,
  Ä: 722,
  Å: 722,
  Æ: 1000,
  Ç: 722,
  È: 667,
  É: 667,
  Ê: 667,
  Ë: 667,
  Ì: 278,
  Í: 278,
  Î: 278,
  Ï: 278,
  Ñ: 722,
  Ò: 778,
  Ó: 778,
  Ô: 778,
  Õ: 778,
  Ö: 778,
  "×": 584,
  Ø: 778,
  Ù: 722,
  Ú: 722,
  Û: 722,
  Ü: 722,
  ß: 611,
  à: 556,
  á: 556,
  â: 556,
  ã: 556,
  ä: 556,
  å: 556,
  æ: 889,
  ç: 556,
  è: 556,
  é: 556,
  ê: 556,
  ë: 556,
  ì: 278,
  í: 278,
  î: 278,
  ï: 278,
  ñ: 611,
  ò: 611,
  ó: 611,
  ô: 611,
  õ: 611,
  ö: 611,
  "÷": 584,
  ø: 611,
  ù: 611,
  ú: 611,
  û: 611,
  ü: 611,
  ÿ: 556,
};

export type MeasureTextOpts = {
  fontSize: number;
  letterSpacing?: number;
  fontWeight?: number | string;
};

let measureImpl: (text: string, opts: MeasureTextOpts) => number = defaultMeasureText;

/** Tests / Node fontkit can replace the default Latin+CJK ruler. */
export function setMeasureText(fn: typeof measureImpl | null): void {
  measureImpl = fn ?? defaultMeasureText;
}

export function isWideScript(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return (
    (cp >= 0x2e80 && cp <= 0x9fff) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0xff00 && cp <= 0xffef) ||
    (cp >= 0x20000 && cp <= 0x2fa1f)
  );
}

export function isBoldWeight(weight?: number | string): boolean {
  if (weight === undefined || weight === null) return false;
  if (typeof weight === "string") {
    const named = weight.toLowerCase();
    if (named === "bold" || named === "semibold" || named === "bolder") return true;
    const n = Number(weight);
    return Number.isFinite(n) && n >= 600;
  }
  return weight >= 600;
}

export function helveticaAdvanceEm(ch: string, bold = false): number {
  return (bold ? HELVETICA_BOLD_ADVANCE[ch] : HELVETICA_ADVANCE[ch]) ?? 556;
}

type AdvanceFont = { unitsPerEm: number; layout: (text: string) => { advanceWidth: number } };
const faceCache = new Map<string, AdvanceFont | null>();

function latinFace(bold: boolean): AdvanceFont | null {
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

function latinAdvancePx(ch: string, size: number, bold: boolean): number {
  const face = latinFace(bold);
  if (face) return (face.layout(ch).advanceWidth / Math.max(face.unitsPerEm, 1)) * size;
  return (helveticaAdvanceEm(ch, bold) / HELVETICA_EM) * size;
}

export function defaultMeasureText(text: string, opts: MeasureTextOpts): number {
  const size = opts.fontSize;
  const tracking = opts.letterSpacing ?? 0;
  const bold = isBoldWeight(opts.fontWeight);
  if (!text) return Math.max(size * 0.4, 0);
  let w = 0;
  for (const ch of text) {
    w += isWideScript(ch) ? size : latinAdvancePx(ch, size, bold);
    w += tracking;
  }
  return Math.max(size * 0.4, w);
}

export function measureText(
  text: string,
  fontSize: number,
  letterSpacing = 0,
  fontWeight: number | string = 400,
): number {
  return measureImpl(text, { fontSize, letterSpacing, fontWeight });
}
