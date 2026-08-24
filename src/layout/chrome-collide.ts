/** Box-based paper chrome: measure, detect overlap, nudge, grow insets. */

export type PlotBox = {
  px0: number;
  px1: number;
  py0: number;
  py1: number;
};

export type CellBox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type PaperChrome = {
  yTickX: number;
  xTickY: number;
  yTitleX: number;
  xTitleY: number;
  titleX: number;
  titleY: number;
  titleLineH: number;
  axisLineH: number;
  legendLineH: number;
  titleLines: string[];
  xTitleLines: string[];
  yTitleLines: string[];
  legendLines: string[][];
  legendX: number;
  legendY: number;
  legendStep: number;
  cbarX: number;
  cbarLines: string[][];
  cbarTitleLines: string[];
  cbarTitleX: number;
  cbarTitleY: number;
  compact: boolean;
};

export type ChromeRect = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ChromeExtras = {
  colorbar?: boolean;
  legendAt?: "right" | "bottom" | "inside";
  legendKeys?: string[];
  title?: string;
  yCaption?: string | null;
  xCaption?: string | null;
  yTicks?: { label: string; y: number }[];
  xTicks?: { label: string; x: number }[];
  panelLabel?: string | null;
  cbarLabels?: string[];
  zCaption?: string | null;
};

export type ChromeGrammar = {
  titleFont: number;
  axisFont: number;
  tickFont: number;
  panelFont: number;
  legendFont: number;
};

const DEFAULT_CHROME_GRAMMAR: ChromeGrammar = {
  titleFont: 12,
  axisFont: 9,
  tickFont: 8,
  panelFont: 11,
  legendFont: 8,
};

let chromeGrammar: ChromeGrammar = { ...DEFAULT_CHROME_GRAMMAR };

/** Handbook typography drives wrap / measure. Not a language keyword. */
export function setChromeGrammar(next?: Partial<ChromeGrammar> | null): ChromeGrammar {
  chromeGrammar = { ...DEFAULT_CHROME_GRAMMAR, ...(next ?? {}) };
  return chromeGrammar;
}

export function getChromeGrammar(): ChromeGrammar {
  return { ...chromeGrammar };
}

export function grammarFromTypography(
  typography?: Partial<Record<string, { size?: number }>> | null,
  roles?: Partial<Record<string, { font?: number }>> | null,
): Partial<ChromeGrammar> {
  const size = (key: string, fallback: number) =>
    typography?.[key]?.size ?? roles?.[key]?.font ?? fallback;
  return {
    titleFont: size("title", DEFAULT_CHROME_GRAMMAR.titleFont),
    axisFont: size("axis", DEFAULT_CHROME_GRAMMAR.axisFont),
    tickFont: size("tick", DEFAULT_CHROME_GRAMMAR.tickFont),
    panelFont: size("panel", roles?.["panel-label"]?.font ?? DEFAULT_CHROME_GRAMMAR.panelFont),
    legendFont: size("legend", DEFAULT_CHROME_GRAMMAR.legendFont),
  };
}

function titleFont(): number {
  return chromeGrammar.titleFont;
}
function axisFont(): number {
  return chromeGrammar.axisFont;
}
function tickFont(): number {
  return chromeGrammar.tickFont;
}
function panelFont(): number {
  return chromeGrammar.panelFont;
}
function legendFont(): number {
  return chromeGrammar.legendFont;
}

export function thinXTicks<T extends { label: string; x: number }>(
  ticks: T[],
  font = tickFont(),
  gap = 4,
  toScene: (px: number) => number = (px) => px,
): T[] {
  if (ticks.length <= 2) return ticks;
  const sorted = [...ticks].sort((a, b) => a.x - b.x);
  const gapScene = toScene(gap);
  const box = (t: T) => {
    const w = toScene(estimateTextWidthPx(t.label, font, 0.08));
    return { x: t.x - w / 2, w };
  };
  const fits = (a: T, b: T) => {
    const left = box(a);
    const right = box(b);
    return left.x + left.w + gapScene <= right.x;
  };
  const kept: T[] = [sorted[0]!];
  const last = sorted[sorted.length - 1]!;
  for (let i = 1; i < sorted.length - 1; i++) {
    const cur = sorted[i]!;
    if (fits(kept[kept.length - 1]!, cur) && fits(cur, last)) kept.push(cur);
  }
  while (kept.length > 1 && !fits(kept[kept.length - 1]!, last)) kept.pop();
  kept.push(last);
  return kept;
}

export function thinYTicks<T extends { label: string; y: number }>(
  ticks: T[],
  font = tickFont(),
  gap = 3,
  toScene: (px: number) => number = (px) => px,
): T[] {
  if (ticks.length <= 2) return ticks;
  const sorted = [...ticks].sort((a, b) => a.y - b.y);
  const kept: T[] = [sorted[0]!];
  const last = sorted[sorted.length - 1]!;
  const minGap = toScene(font + gap);
  const fits = (a: T, b: T) => Math.abs(a.y - b.y) >= minGap;
  for (let i = 1; i < sorted.length - 1; i++) {
    const cur = sorted[i]!;
    if (fits(kept[kept.length - 1]!, cur) && fits(cur, last)) kept.push(cur);
  }
  while (kept.length > 1 && !fits(kept[kept.length - 1]!, last)) kept.pop();
  kept.push(last);
  return kept;
}

function lastCjkIndex(text: string): number {
  for (let i = text.length - 1; i >= 0; i--) {
    if ((text.charCodeAt(i) ?? 0) >= 0x3000) return i;
  }
  return -1;
}

const ELLIPSIS = "...";

export function ellipsizeToWidth(
  text: string,
  maxWidth: number,
  font: number,
  tracking = 0.35,
): string {
  const src = text.trim();
  if (!src) return "";
  if (estimateTextWidthPx(src, font, tracking) <= maxWidth) return src;
  if (estimateTextWidthPx(ELLIPSIS, font, tracking) > maxWidth) {
    let cut = src;
    while (cut && estimateTextWidthPx(cut, font, tracking) > maxWidth) cut = cut.slice(0, -1);
    return cut;
  }
  let cut = src;
  while (cut && estimateTextWidthPx(`${cut}${ELLIPSIS}`, font, tracking) > maxWidth) {
    cut = cut.slice(0, -1).trimEnd();
  }
  while (cut.endsWith("-")) cut = cut.slice(0, -1).trimEnd();
  return cut ? `${cut}${ELLIPSIS}` : ELLIPSIS;
}

function isUnbreakableLatin(text: string): boolean {
  return ![...text].some((ch) => ch === " " || ch === "-" || ch.charCodeAt(0) >= 0x3000);
}

function linesFitWidth(
  lines: string[],
  width: number,
  font: number,
  tracking: number,
  maxLines: number,
): boolean {
  if (!lines.length || (maxLines > 0 && lines.length > maxLines)) return false;
  return lines.every((line) => estimateTextWidthPx(line, font, tracking) <= width + 0.5);
}

/** Narrowest width that holds `text` in `maxLines` without ellipsis. */
export function minWidthForLines(
  text: string,
  font: number,
  tracking: number,
  maxLines: number,
): number {
  const src = text.trim();
  if (!src) return 0;
  const full = estimateTextWidthPx(src, font, tracking);
  if (maxLines <= 1 || isUnbreakableLatin(src)) return full;
  const fits = (width: number) =>
    linesFitWidth(wrapTextLines(src, width, font, tracking, 0), width, font, tracking, maxLines);
  if (!fits(full)) return full;
  let lo = font;
  let hi = Math.max(font, full);
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function wrapTextLines(
  text: string,
  maxWidth: number,
  font: number,
  tracking = 0.35,
  maxLines = 0,
): string[] {
  const src = text.trim();
  if (!src) return [];
  if (maxWidth <= font || estimateTextWidthPx(src, font, tracking) <= maxWidth) return [src];
  const lines: string[] = [];
  let line = "";
  const flush = () => {
    const trimmed = line.trim();
    if (trimmed) lines.push(trimmed);
    line = "";
  };
  for (const ch of src) {
    const trial = line + ch;
    if (line && estimateTextWidthPx(trial.trimEnd(), font, tracking) > maxWidth) {
      const space = line.lastIndexOf(" ");
      const hyphen = line.lastIndexOf("-");
      const cjk = lastCjkIndex(line);
      if (space > 0 && space >= hyphen && space >= cjk) {
        lines.push(line.slice(0, space).trim());
        line = `${line.slice(space + 1)}${ch}`;
      } else if (hyphen > 0 && hyphen >= cjk) {
        lines.push(line.slice(0, hyphen + 1).trimEnd());
        line = `${line.slice(hyphen + 1)}${ch}`;
      } else if (cjk >= 0) {
        lines.push(line.slice(0, cjk + 1).trimEnd());
        line = `${line.slice(cjk + 1)}${ch}`;
      } else {
        flush();
        if (ch !== " ") line = ch;
      }
    } else {
      line = trial;
    }
  }
  flush();
  const out = lines.length ? lines : [src];
  if (maxLines > 0 && out.length > maxLines) {
    const last = ellipsizeToWidth(out.slice(maxLines - 1).join(" "), maxWidth, font, tracking);
    return [...out.slice(0, maxLines - 1), last];
  }
  return out;
}

export function estimateTextWidthPx(text: string, font: number, tracking = 0): number {
  let w = 0;
  for (const ch of text) {
    w += ch.charCodeAt(0) >= 0x3000 ? font : font * 0.58;
    w += tracking;
  }
  return Math.max(font * 0.4, w);
}

export function rectsOverlap(a: ChromeRect, b: ChromeRect, gap = 2): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

export function overflowDelta(
  rect: ChromeRect,
  cell: CellBox,
  pad: number,
): { l: number; r: number; t: number; b: number } {
  return {
    l: Math.max(0, cell.x0 + pad - rect.x),
    r: Math.max(0, rect.x + rect.w - (cell.x1 - pad)),
    t: Math.max(0, cell.y0 + pad - rect.y),
    b: Math.max(0, rect.y + rect.h - (cell.y1 - pad)),
  };
}

/** Shift a span toward `[wantLo, wantHi]` without adding `[wallLo, wallHi]` overflow. */
export function fitShift(
  x0: number,
  x1: number,
  wantLo: number,
  wantHi: number,
  wallLo: number,
  wallHi: number,
): number {
  const overflowLo = Math.max(0, wallLo - x0);
  const overflowHi = Math.max(0, x1 - wallHi);
  let dx = 0;
  if (x0 < wantLo) dx += wantLo - x0;
  if (x1 + dx > wantHi) dx -= x1 + dx - wantHi;
  const nextLo = Math.max(0, wallLo - (x0 + dx));
  const nextHi = Math.max(0, x1 + dx - wallHi);
  if (nextLo > overflowLo) dx += nextLo - overflowLo;
  if (nextHi > overflowHi) dx -= nextHi - overflowHi;
  return dx;
}

/** Scene leftover → px wrap budget. Identity `toScene` keeps px exams green. */
function sceneToPx(scene: number, toScene: (px: number) => number): number {
  const unit = toScene(1);
  return unit === 0 ? scene : scene / unit;
}

export function placePaperChrome(
  box: PlotBox,
  toScene: (px: number) => number,
  compact: boolean,
  extras: ChromeExtras = {},
  cell?: CellBox,
): { chrome: PaperChrome; rects: ChromeRect[] } {
  const gap = toScene(compact ? 3 : 5);
  const toPx = (scene: number) => sceneToPx(scene, toScene);
  const textW = (s: string, font: number, tracking: number) =>
    toScene(estimateTextWidthPx(s, font, tracking));
  const yTicks = extras.yTicks ?? [];
  const xTicks = extras.xTicks ?? [];
  const yTickW = Math.max(
    tickFont(),
    ...yTicks.map((t) => estimateTextWidthPx(t.label, tickFont(), 0.08)),
  );
  const keys = extras.legendKeys ?? [];
  const keyW = Math.max(0, ...keys.map((k) => estimateTextWidthPx(k, tickFont(), 0.1)));
  const yCap = extras.yCaption ?? null;
  const xCap = extras.xCaption ?? null;
  const title = extras.title ?? "";
  const cbarLabels = extras.cbarLabels ?? ["0.00"];
  const zCap = extras.zCaption ?? null;

  let yTickX = box.px0 - gap;
  let yTitleX = Math.max(
    toScene(compact ? 4 : 8),
    yTickX - toScene(yTickW) - toScene(axisFont() * 0.55) - gap,
  );
  let xTickY = box.py1 + toScene(tickFont()) + gap;
  let xTitleY = xTickY + toScene(axisFont()) + gap;
  let titleX = box.px0;
  let titleY = Math.max(toScene(compact ? 8 : 14), box.py0 - toScene(titleFont()) - gap);
  let titleLines = title ? [title] : [];
  let xTitleLines = xCap ? [xCap] : [];
  let yTitleLines = yCap ? [yCap] : [];
  let legendLines = keys.map((key) => [key]);
  const titleLineH = toScene(titleFont() + 2);
  const axisLineH = toScene(axisFont() + 2);
  const legendLineH = toScene(tickFont() + 2);
  let cbarX = box.px1 + toScene(compact ? 4 : 8);
  let cbarLines = cbarLabels.map((s) => [s]);
  let cbarTitleLines: string[] = [];
  let cbarTitleX = cbarX + toScene(14);
  let cbarTitleY = (box.py0 + box.py1) / 2;
  let cbarNeedW = 0;
  let legendNeedW = 0;
  const cbarLabelW = () =>
    Math.max(
      tickFont(),
      cbarNeedW,
      ...cbarLines.flatMap((lines) => lines.map((s) => estimateTextWidthPx(s, tickFont(), 0.08))),
    );
  const cbarTitleCol = () =>
    cbarTitleLines.length
      ? toScene(axisFont()) + (cbarTitleLines.length - 1) * axisLineH + toScene(4)
      : 0;
  const cbarRight = () =>
    extras.colorbar ? cbarX + toScene(10 + 4 + cbarLabelW()) + cbarTitleCol() : box.px1;
  let legendX =
    extras.legendAt === "right"
      ? (extras.colorbar ? cbarRight() : box.px1) + toScene(compact ? 6 : 10)
      : extras.legendAt === "inside"
        ? box.px0 + toScene(12)
        : box.px0 + toScene(8);
  let legendY =
    extras.legendAt === "bottom"
      ? xTitleY + toScene(axisFont()) + gap
      : extras.legendAt === "inside"
        ? box.py1 - toScene(14)
        : box.py0 + toScene(12);
  let legendStep =
    extras.legendAt === "bottom"
      ? Math.max(toScene(72), toScene(14 + keyW + 10))
      : toScene(14);

  const panel =
    extras.panelLabel && cell
      ? {
          id: "panel-label",
          x: cell.x0 + toScene(6),
          y: cell.y0 + toScene(4),
          w: textW(extras.panelLabel, panelFont(), 0.15),
          h: toScene(panelFont() + 2),
        }
      : null;

  const build = (): ChromeRect[] => {
    const rects: ChromeRect[] = [];
    if (panel) rects.push(panel);
    if (titleLines.length) {
      const lineW = Math.max(...titleLines.map((line) => textW(line, titleFont(), 0.35)));
      rects.push({
        id: "title",
        x: titleX,
        y: titleY - toScene(titleFont() * 0.75),
        w: lineW,
        h: titleLineH * titleLines.length,
      });
    }
    for (const [i, tick] of yTicks.entries()) {
      const tw = textW(tick.label, tickFont(), 0.08);
      rects.push({
        id: `ytick-${i}`,
        x: yTickX - tw,
        y: tick.y - toScene(tickFont() * 0.5),
        w: tw,
        h: toScene(tickFont()),
      });
    }
    for (const [i, tick] of xTicks.entries()) {
      const tw = textW(tick.label, tickFont(), 0.08);
      rects.push({
        id: `xtick-${i}`,
        x: tick.x - tw / 2,
        y: xTickY - toScene(tickFont() * 0.75),
        w: tw,
        h: toScene(tickFont()),
      });
    }
    if (yTitleLines.length) {
      const tw = Math.max(...yTitleLines.map((line) => textW(line, axisFont(), 0.2)));
      const n = yTitleLines.length;
      rects.push({
        id: "yTitle",
        x: yTitleX - toScene(axisFont() * 0.85) - (n - 1) * axisLineH,
        y: (box.py0 + box.py1) / 2 - tw / 2,
        w: toScene(axisFont() * 1.4) + (n - 1) * axisLineH,
        h: tw,
      });
    }
    if (xTitleLines.length) {
      const tw = Math.max(...xTitleLines.map((line) => textW(line, axisFont(), 0.2)));
      const n = xTitleLines.length;
      rects.push({
        id: "xTitle",
        x: (box.px0 + box.px1) / 2 - tw / 2,
        y: xTitleY - toScene(axisFont() * 0.75),
        w: tw,
        h: toScene(axisFont()) + (n - 1) * axisLineH,
      });
    }
    if (extras.colorbar) {
      rects.push({
        id: "cbar",
        x: cbarX,
        y: box.py0,
        w: toScene(10 + 4 + cbarLabelW()),
        h: Math.max(toScene(8), box.py1 - box.py0),
      });
      if (cbarTitleLines.length) {
        const tw = Math.max(...cbarTitleLines.map((line) => textW(line, axisFont(), 0.2)));
        const n = cbarTitleLines.length;
        rects.push({
          id: "cbar-title",
          x: cbarTitleX - toScene(axisFont() * 0.5) - (n - 1) * axisLineH,
          y: cbarTitleY - tw / 2,
          w: toScene(axisFont()) + (n - 1) * axisLineH,
          h: tw,
        });
      }
    }
    if (extras.legendAt && extras.legendAt !== "inside") {
      for (const [i, key] of keys.entries()) {
        const lines = legendLines[i] ?? [key];
        const tw = toScene(
          Math.max(
            extras.legendAt === "right" ? legendNeedW : 0,
            ...lines.map((line) => estimateTextWidthPx(line, tickFont(), 0.1)),
          ),
        );
        const x = extras.legendAt === "bottom" ? legendX + i * legendStep : legendX;
        const y = extras.legendAt === "bottom" ? legendY : legendY + i * legendStep;
        rects.push({
          id: `legend-${i}`,
          x,
          y: y - toScene(6),
          w: toScene(14) + tw,
          h: toScene(tickFont() + 4) + (lines.length - 1) * legendLineH,
        });
      }
    }
    return rects;
  };

  let rects = build();
  const collide = (id: string, other: string) =>
    rects.some((a) => {
      if (a.id !== id && !a.id.startsWith(id)) return false;
      return rects.some((b) => (b.id === other || b.id.startsWith(other)) && a.id !== b.id && rectsOverlap(a, b, gap));
    });

  let titleWrapExtra = 0;
  const wrapChrome = () => {
    if (title) {
      const maxW = Math.max(titleFont() * 4, toPx(box.px1 - titleX) - 4);
      const next = wrapTextLines(title, maxW, titleFont(), 0.35, 3);
      titleLines = next.length ? next : [title];
      const extra = Math.max(0, titleLines.length - 1);
      if (extra !== titleWrapExtra) {
        titleY -= (extra - titleWrapExtra) * titleLineH;
        titleWrapExtra = extra;
      }
    }
    if (xCap) {
      const maxW = Math.max(axisFont() * 4, toPx(box.px1 - box.px0));
      const next = wrapTextLines(xCap, maxW, axisFont(), 0.2, 3);
      xTitleLines = next.length ? next : [xCap];
    }
    if (yCap) {
      const maxW = Math.max(axisFont() * 4, toPx(box.py1 - box.py0));
      const next = wrapTextLines(yCap, maxW, axisFont(), 0.2, 3);
      yTitleLines = next.length ? next : [yCap];
    }
    if (keys.length && extras.legendAt && extras.legendAt !== "inside") {
      const leftover =
        extras.legendAt === "bottom"
          ? legendStep - toScene(14) - toScene(6)
          : cell
            ? cell.x1 - legendX - toScene(14)
            : toScene(compact ? 52 : 72);
      const maxW = Math.max(legendFont() * 5, toPx(leftover));
      legendLines = keys.map((key) => {
        const need = minWidthForLines(key, legendFont(), 0.1, 2);
        const room = cell ? toPx((cell.x1 - cell.x0) * 0.5 - toScene(20)) : maxW;
        const wrapW =
          extras.legendAt === "right" && isUnbreakableLatin(key) && need <= Math.max(maxW, room)
            ? Math.max(maxW, need)
            : maxW;
        const lines = wrapTextLines(key, wrapW, legendFont(), 0.1, 2);
        return lines.length ? lines : [key];
      });
      if (extras.legendAt === "right") {
        legendNeedW = Math.max(0, ...keys.map((key) => minWidthForLines(key, legendFont(), 0.1, 2)));
      }
      const extra = Math.max(0, ...legendLines.map((lines) => lines.length - 1));
      if (extras.legendAt !== "bottom" && extra > 0) {
        legendStep = toScene(14) + extra * legendLineH;
      }
    }
    if (extras.colorbar) {
      const leftoverScene = cell
        ? cell.x1 - (cbarX + toScene(14)) - toScene(4)
        : toScene(compact ? 36 : 56);
      const leftover = Math.max(tickFont() * 4, toPx(leftoverScene));
      cbarLines = cbarLabels.map((label) => {
        cbarNeedW = Math.max(cbarNeedW, minWidthForLines(label, tickFont(), 0.08, 2));
        const lines = wrapTextLines(label, leftover, tickFont(), 0.08, 2);
        return lines.length ? lines : [label];
      });
      if (zCap) {
        const maxW = Math.max(axisFont() * 4, toPx(box.py1 - box.py0));
        cbarTitleLines = wrapTextLines(zCap, maxW, axisFont(), 0.2, 3);
        if (!cbarTitleLines.length) cbarTitleLines = [zCap];
        cbarTitleX = cbarX + toScene(10 + 4 + cbarLabelW()) + toScene(axisFont() * 0.55);
        cbarTitleY = (box.py0 + box.py1) / 2;
      }
    }
  };

  const applyPoseResiduals = (): number => {
    let residual = 0;
    const take = (from: number, to: number) => {
      residual += Math.abs(to - from);
      return to;
    };
    rects = build();
    if (panel && title && collide("title", "panel-label")) {
      titleX = take(titleX, panel.x + panel.w + gap);
    }
    if (yCap && yTicks.length && collide("yTitle", "ytick-")) {
      const tickLeft = Math.min(...rects.filter((r) => r.id.startsWith("ytick-")).map((r) => r.x));
      yTitleX = take(yTitleX, tickLeft - gap - toScene(axisFont() * 0.5));
    }
    if (xCap && xTicks.length && collide("xTitle", "xtick-")) {
      const tickBot = Math.max(...rects.filter((r) => r.id.startsWith("xtick-")).map((r) => r.y + r.h));
      xTitleY = take(xTitleY, tickBot + gap + toScene(axisFont() * 0.75));
    }
    if (extras.colorbar && extras.legendAt === "right" && collide("legend-", "cbar")) {
      const cbar = rects.find((r) => r.id === "cbar");
      if (cbar) legendX = take(legendX, cbar.x + cbar.w + gap);
    } else if (extras.colorbar && extras.legendAt === "right") {
      legendX = take(legendX, cbarRight() + toScene(compact ? 6 : 10));
    }
    if (extras.legendAt === "bottom" && xCap && collide("legend-", "xTitle")) {
      legendY = take(
        legendY,
        xTitleY + toScene(axisFont()) + gap + (xTitleLines.length - 1) * axisLineH,
      );
    }
    if (!cell) {
      rects = build();
      return residual;
    }
    rects = build();
    const pad = toScene(compact ? 2 : 3);
    const wantX0 = cell.x0 + pad;
    const wantX1 = cell.x1 - pad;
    const wantY0 = cell.y0 + pad;
    const wantY1 = cell.y1 - pad;
    const union = (ids: string[]) => {
      const mine = rects.filter((r) => ids.some((id) => r.id === id || r.id.startsWith(id)));
      if (!mine.length) return null;
      return {
        x0: Math.min(...mine.map((r) => r.x)),
        y0: Math.min(...mine.map((r) => r.y)),
        x1: Math.max(...mine.map((r) => r.x + r.w)),
        y1: Math.max(...mine.map((r) => r.y + r.h)),
      };
    };
    const tickLeft = Math.min(
      box.px0,
      ...rects.filter((r) => r.id.startsWith("ytick-")).map((r) => r.x),
    );
    const tickBot = Math.max(
      box.py1,
      ...rects.filter((r) => r.id.startsWith("xtick-")).map((r) => r.y + r.h),
    );
    const titleBox = union(["title"]);
    if (titleBox) {
      titleX = take(titleX, titleX + fitShift(titleBox.x0, titleBox.x1, wantX0, wantX1, wantX0, wantX1));
      titleY = take(titleY, titleY + fitShift(titleBox.y0, titleBox.y1, wantY0, wantY1, wantY0, box.py0 - gap));
    }
    const yTitleBox = union(["yTitle"]);
    if (yTitleBox) {
      yTitleX = take(yTitleX, yTitleX + fitShift(yTitleBox.x0, yTitleBox.x1, wantX0, wantX1, wantX0, tickLeft - gap));
    }
    const xTitleBox = union(["xTitle"]);
    if (xTitleBox) {
      xTitleY = take(xTitleY, xTitleY + fitShift(xTitleBox.y0, xTitleBox.y1, wantY0, wantY1, tickBot + gap, wantY1));
    }
    const plotRight = extras.colorbar ? cbarRight() + gap : box.px1 + gap;
    if (extras.colorbar) {
      const cbarBox = union(["cbar", "cbar-title"]);
      if (cbarBox) {
        const dx = fitShift(cbarBox.x0, cbarBox.x1, wantX0, wantX1, plotRight - (cbarBox.x1 - cbarBox.x0), wantX1);
        cbarX = take(cbarX, cbarX + dx);
        cbarTitleX += dx;
      }
      const zTitleBox = union(["cbar-title"]);
      if (zTitleBox) {
        cbarTitleY = take(cbarTitleY, cbarTitleY + fitShift(zTitleBox.y0, zTitleBox.y1, wantY0, wantY1, box.py0, box.py1));
      }
    }
    if (extras.legendAt === "right" || extras.legendAt === "bottom") {
      const legendBox = union(["legend-"]);
      if (legendBox) {
        if (extras.legendAt === "right") {
          legendX = take(legendX, legendX + fitShift(legendBox.x0, legendBox.x1, wantX0, wantX1, plotRight, wantX1));
        } else {
          legendY = take(legendY, legendY + fitShift(legendBox.y0, legendBox.y1, wantY0, wantY1, tickBot + gap, wantY1));
        }
      }
    }
    rects = build();
    return residual;
  };

  wrapChrome();
  for (let i = 0; i < 6; i++) {
    wrapChrome();
    if (applyPoseResiduals() < 0.4) break;
  }

  return {
    chrome: {
      yTickX,
      xTickY,
      yTitleX,
      xTitleY,
      titleX,
      titleY,
      titleLineH,
      axisLineH,
      legendLineH,
      titleLines,
      xTitleLines,
      yTitleLines,
      legendLines,
      legendX,
      legendY,
      legendStep,
      cbarX,
      cbarLines,
      cbarTitleLines,
      cbarTitleX,
      cbarTitleY,
      compact,
    },
    rects,
  };
}

function pairSide(a: ChromeRect, b: ChromeRect): "l" | "r" | "t" | "b" | null {
  const ids = [a.id, b.id];
  const has = (re: RegExp) => ids.some((id) => re.test(id));
  if (has(/^yTitle$/)) return "l";
  if (has(/^cbar/) || has(/^legend-/)) return "r";
  if (has(/^title$/) || has(/^panel-label$/)) return "t";
  if (has(/^xTitle$/) || has(/^xtick-/)) return "b";
  return null;
}

/** Grow by cell overflow, plus same-side chrome overlap (not title-vs-ytick width). */
export function growInsetsForChrome(
  rects: ChromeRect[],
  cell: CellBox,
  pad: number,
): { l: number; r: number; t: number; b: number } {
  const out = { l: 0, r: 0, t: 0, b: 0 };
  for (const rect of rects) {
    const d = overflowDelta(rect, cell, pad);
    out.l = Math.max(out.l, d.l);
    out.r = Math.max(out.r, d.r);
    out.t = Math.max(out.t, d.t);
    out.b = Math.max(out.b, d.b);
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!;
      const b = rects[j]!;
      if (!rectsOverlap(a, b, pad)) continue;
      const side = pairSide(a, b);
      if (!side) continue;
      const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + pad;
      const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + pad;
      if (side === "l") out.l = Math.max(out.l, overlapW);
      if (side === "r") out.r = Math.max(out.r, overlapW);
      if (side === "t") out.t = Math.max(out.t, overlapH);
      if (side === "b") out.b = Math.max(out.b, overlapH);
    }
  }
  return out;
}

export type InsetBox = { l: number; r: number; t: number; b: number };

export type PlotFloor = {
  /** Smallest plot / cell fraction on each axis. */
  minFrac?: number;
  /** Absolute scene-unit floor for the plot span. */
  minScene?: number;
};

/** Historical per-side fractions. Solver no longer clamps to these. */
export const INSET_CAP_SOFT = { l: 0.38, r: 0.38, t: 0.28, b: 0.32 };
/** Historical second-pass fractions. Solver no longer clamps to these. */
export const INSET_CAP_FIT = { l: 0.5, r: 0.5, t: 0.4, b: 0.42 };

/** Keep a usable plot; chrome may take the leftover (past 38% / 50%). */
export const MIN_PLOT_FRAC = 0.22;
export const MIN_PLOT_SCENE = 8;

function squeezePair(
  a: number,
  b: number,
  floorA: number,
  floorB: number,
  budget: number,
  prefer: "a" | "b",
): [number, number] {
  const extra = a + b - budget;
  if (extra <= 1e-6) return [a, b];
  const slackA = Math.max(0, a - floorA);
  const slackB = Math.max(0, b - floorB);
  const first = prefer === "b" ? slackB : slackA;
  const takeFirst = Math.min(extra, first);
  const takeSecond = Math.min(extra - takeFirst, prefer === "b" ? slackA : slackB);
  if (prefer === "b") return [a - takeSecond, b - takeFirst];
  return [a - takeFirst, b - takeSecond];
}

export function clampChartInsets(
  insets: InsetBox,
  cellW: number,
  cellH: number,
  floor: InsetBox,
  plotFloor: PlotFloor = {},
): InsetBox {
  const minFrac = plotFloor.minFrac ?? MIN_PLOT_FRAC;
  const minScene = plotFloor.minScene ?? MIN_PLOT_SCENE;
  const minPlotW = Math.max(minScene, cellW * minFrac);
  const minPlotH = Math.max(minScene, cellH * minFrac);
  let l = Math.max(floor.l, insets.l);
  let r = Math.max(floor.r, insets.r);
  let t = Math.max(floor.t, insets.t);
  let b = Math.max(floor.b, insets.b);
  [l, r] = squeezePair(l, r, floor.l, floor.r, Math.max(minScene, cellW - minPlotW), "b");
  [t, b] = squeezePair(t, b, floor.t, floor.b, Math.max(minScene, cellH - minPlotH), "a");
  return { l, r, t, b };
}

export type NeighborChrome = {
  cell: CellBox;
  rects: ChromeRect[];
};

export function growInsetsForNeighbors(
  rects: ChromeRect[],
  cell: CellBox,
  neighbors: NeighborChrome[],
  pad: number,
): { l: number; r: number; t: number; b: number } {
  const out = { l: 0, r: 0, t: 0, b: 0 };
  const selfCx = (cell.x0 + cell.x1) / 2;
  const selfCy = (cell.y0 + cell.y1) / 2;
  for (const nb of neighbors) {
    const nbRect: ChromeRect = {
      id: "neighbor-cell",
      x: nb.cell.x0,
      y: nb.cell.y0,
      w: Math.max(1, nb.cell.x1 - nb.cell.x0),
      h: Math.max(1, nb.cell.y1 - nb.cell.y0),
    };
    const dx = (nb.cell.x0 + nb.cell.x1) / 2 - selfCx;
    const dy = (nb.cell.y0 + nb.cell.y1) / 2 - selfCy;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    for (const rect of rects) {
      const hits: ChromeRect[] = [nbRect, ...nb.rects];
      for (const other of hits) {
        if (!rectsOverlap(rect, other, pad)) continue;
        const overlapW = Math.min(rect.x + rect.w, other.x + other.w) - Math.max(rect.x, other.x) + pad;
        const overlapH = Math.min(rect.y + rect.h, other.y + other.h) - Math.max(rect.y, other.y) + pad;
        if (horizontal) {
          if (dx > 0) out.r = Math.max(out.r, overlapW);
          else out.l = Math.max(out.l, overlapW);
        } else {
          if (dy > 0) out.b = Math.max(out.b, overlapH);
          else out.t = Math.max(out.t, overlapH);
        }
      }
    }
  }
  return out;
}
