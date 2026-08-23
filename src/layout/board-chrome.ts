/** Measure board safe/title/lower/hud from copy. Not a typesetter. */

import { estimateTextWidthPx, wrapTextLines } from "./chrome-collide.js";

const TITLE_FONT = 12;
const SUB_FONT = 10;
const CAP_FONT = 8;
const CHIP_FONT = 8;
const TITLE_LINE = TITLE_FONT + 4;
const SUB_LINE = SUB_FONT + 4;
const CAP_LINE = CAP_FONT + 4;
const CHIP_H = 22;
const PAD = 10;

export type BoardBands = {
  safe: number;
  titleH: number;
  lowerH: number;
  hudW: number;
  chipH: number;
  chipWs: number[];
  titleLines: string[];
  subtitleLines: string[];
  captionLines: string[];
};

export function estimateSafeMargin(width: number, height: number): number {
  return Math.max(16, Math.min(72, Math.round(Math.min(width, height) * 0.045)));
}

export function measureChipWidth(key: string): number {
  return Math.max(44, Math.round(estimateTextWidthPx(key, CHIP_FONT, 0.1) + 16));
}

export function estimateBoardBands(opts: {
  width: number;
  height: number;
  safe?: number;
  titleH?: number;
  lowerH?: number;
  title?: string | null;
  subtitle?: string | null;
  caption?: string | null;
  hasTitle: boolean;
  hasSubtitle: boolean;
  hasCaption: boolean;
  controlKeys: string[];
  hasBind: boolean;
}): BoardBands {
  const safe = opts.safe ?? estimateSafeMargin(opts.width, opts.height);
  const copyW = Math.max(40, opts.width - safe * 2);
  const titleLines = opts.title ? wrapTextLines(opts.title, copyW, TITLE_FONT, 0.35, 3) : [];
  const subtitleLines = opts.subtitle
    ? wrapTextLines(opts.subtitle, copyW, SUB_FONT, 0.2, 2)
    : [];

  let chipWs = opts.controlKeys.map(measureChipWidth);
  const gaps = Math.max(0, opts.controlKeys.length) * 8 + 8;
  let hudW = opts.controlKeys.length ? chipWs.reduce((a, b) => a + b, 0) + gaps : 0;
  const hudCap = copyW * 0.5;
  if (hudW > hudCap && chipWs.length) {
    const room = Math.max(36 * chipWs.length, hudCap - gaps);
    const scale = room / chipWs.reduce((a, b) => a + b, 0);
    chipWs = chipWs.map((w) => Math.max(36, Math.round(w * scale)));
    hudW = chipWs.reduce((a, b) => a + b, 0) + gaps;
  }

  const capW = Math.max(40, copyW - (hudW ? hudW + 12 : 0));
  const captionLines = opts.caption ? wrapTextLines(opts.caption, capW, CAP_FONT, 0.12, 3) : [];

  let titleH = opts.titleH;
  if (titleH === undefined) {
    if (titleLines.length || subtitleLines.length) {
      titleH = PAD + titleLines.length * TITLE_LINE + subtitleLines.length * SUB_LINE + 4;
    } else if (opts.hasTitle) {
      titleH = opts.hasSubtitle ? 56 : 40;
    } else {
      titleH = 72;
    }
  }

  let lowerH = opts.lowerH;
  if (lowerH === undefined) {
    const capBlock = captionLines.length
      ? captionLines.length * CAP_LINE + PAD
      : opts.hasCaption
        ? 48
        : 0;
    const hudBlock = opts.controlKeys.length ? CHIP_H + PAD * 2 : 0;
    if (capBlock || hudBlock) lowerH = Math.max(36, capBlock, hudBlock);
    else lowerH = 96;
  }

  const innerH = Math.max(48, opts.height - safe * 2);
  const maxChrome = innerH * 0.42;
  if (titleH + lowerH > maxChrome) {
    const scale = maxChrome / Math.max(1, titleH + lowerH);
    titleH = Math.max(28, Math.round(titleH * scale));
    lowerH = Math.max(32, Math.round(lowerH * scale));
  }

  return {
    safe,
    titleH,
    lowerH,
    hudW,
    chipH: CHIP_H,
    chipWs,
    titleLines,
    subtitleLines,
    captionLines,
  };
}
