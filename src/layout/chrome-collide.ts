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
  titleLines: string[];
  xTitleLines: string[];
  yTitleLines: string[];
  legendLines: string[][];
  legendX: number;
  legendY: number;
  legendStep: number;
  cbarX: number;
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
};

const TICK_FONT = 8;
const AXIS_FONT = 9;
const TITLE_FONT = 12;
const PANEL_FONT = 11;

export function thinXTicks<T extends { label: string; x: number }>(
  ticks: T[],
  font = TICK_FONT,
  gap = 4,
): T[] {
  if (ticks.length <= 2) return ticks;
  const sorted = [...ticks].sort((a, b) => a.x - b.x);
  const box = (t: T) => {
    const w = estimateTextWidthPx(t.label, font, 0.08);
    return { x: t.x - w / 2, w };
  };
  const fits = (a: T, b: T) => {
    const left = box(a);
    const right = box(b);
    return left.x + left.w + gap <= right.x;
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
  font = TICK_FONT,
  gap = 3,
): T[] {
  if (ticks.length <= 2) return ticks;
  const sorted = [...ticks].sort((a, b) => a.y - b.y);
  const kept: T[] = [sorted[0]!];
  const last = sorted[sorted.length - 1]!;
  const fits = (a: T, b: T) => Math.abs(a.y - b.y) >= font + gap;
  for (let i = 1; i < sorted.length - 1; i++) {
    const cur = sorted[i]!;
    if (fits(kept[kept.length - 1]!, cur) && fits(cur, last)) kept.push(cur);
  }
  while (kept.length > 1 && !fits(kept[kept.length - 1]!, last)) kept.pop();
  kept.push(last);
  return kept;
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
      if (space > 0 && space >= hyphen) {
        lines.push(line.slice(0, space).trim());
        line = `${line.slice(space + 1)}${ch}`;
      } else if (hyphen > 0) {
        lines.push(line.slice(0, hyphen + 1).trimEnd());
        line = `${line.slice(hyphen + 1)}${ch}`;
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
    return [...out.slice(0, maxLines - 1), out.slice(maxLines - 1).join(" ")];
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

export function placePaperChrome(
  box: PlotBox,
  toScene: (px: number) => number,
  compact: boolean,
  extras: ChromeExtras = {},
  cell?: CellBox,
): { chrome: PaperChrome; rects: ChromeRect[] } {
  const gap = toScene(compact ? 3 : 5);
  const yTicks = extras.yTicks ?? [];
  const xTicks = extras.xTicks ?? [];
  const yTickW = Math.max(
    TICK_FONT,
    ...yTicks.map((t) => estimateTextWidthPx(t.label, TICK_FONT, 0.08)),
  );
  const keys = extras.legendKeys ?? [];
  const keyW = Math.max(0, ...keys.map((k) => estimateTextWidthPx(k, TICK_FONT, 0.1)));
  const yCap = extras.yCaption ?? null;
  const xCap = extras.xCaption ?? null;
  const title = extras.title ?? "";
  const cbarLabels = extras.cbarLabels ?? ["0.00"];

  let yTickX = box.px0 - gap;
  let yTitleX = Math.max(
    toScene(compact ? 4 : 8),
    yTickX - toScene(yTickW + AXIS_FONT * 0.55 + gap),
  );
  let xTickY = box.py1 + toScene(TICK_FONT + gap);
  let xTitleY = xTickY + toScene(AXIS_FONT + gap);
  let titleX = box.px0;
  let titleY = Math.max(toScene(compact ? 8 : 14), box.py0 - toScene(TITLE_FONT + gap));
  let titleLines = title ? [title] : [];
  let xTitleLines = xCap ? [xCap] : [];
  let yTitleLines = yCap ? [yCap] : [];
  let legendLines = keys.map((key) => [key]);
  const axisLine = AXIS_FONT + 2;
  const legendLine = TICK_FONT + 2;
  let cbarX = box.px1 + toScene(compact ? 4 : 8);
  const cbarLabelW = Math.max(
    ...cbarLabels.map((s) => estimateTextWidthPx(s, TICK_FONT, 0.08)),
  );
  const cbarRight = extras.colorbar ? cbarX + toScene(10 + 4 + cbarLabelW) : box.px1;
  let legendX =
    extras.legendAt === "right"
      ? (extras.colorbar ? cbarRight : box.px1) + toScene(compact ? 6 : 10)
      : extras.legendAt === "inside"
        ? box.px0 + toScene(12)
        : box.px0 + toScene(8);
  let legendY =
    extras.legendAt === "bottom"
      ? xTitleY + toScene(AXIS_FONT + gap)
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
          x: cell.x0 + 6,
          y: cell.y0 + 4,
          w: estimateTextWidthPx(extras.panelLabel, PANEL_FONT, 0.15),
          h: PANEL_FONT + 2,
        }
      : null;

  const build = (): ChromeRect[] => {
    const rects: ChromeRect[] = [];
    if (panel) rects.push(panel);
    if (titleLines.length) {
      const lineH = TITLE_FONT + 2;
      const lineW = Math.max(
        ...titleLines.map((line) => estimateTextWidthPx(line, TITLE_FONT, 0.35)),
      );
      rects.push({
        id: "title",
        x: titleX,
        y: titleY - TITLE_FONT * 0.75,
        w: lineW,
        h: lineH * titleLines.length,
      });
    }
    for (const [i, tick] of yTicks.entries()) {
      const tw = estimateTextWidthPx(tick.label, TICK_FONT, 0.08);
      rects.push({
        id: `ytick-${i}`,
        x: yTickX - tw,
        y: tick.y - TICK_FONT * 0.5,
        w: tw,
        h: TICK_FONT,
      });
    }
    for (const [i, tick] of xTicks.entries()) {
      const tw = estimateTextWidthPx(tick.label, TICK_FONT, 0.08);
      rects.push({
        id: `xtick-${i}`,
        x: tick.x - tw / 2,
        y: xTickY - TICK_FONT * 0.75,
        w: tw,
        h: TICK_FONT,
      });
    }
    if (yTitleLines.length) {
      const tw = Math.max(
        ...yTitleLines.map((line) => estimateTextWidthPx(line, AXIS_FONT, 0.2)),
      );
      const n = yTitleLines.length;
      rects.push({
        id: "yTitle",
        x: yTitleX - AXIS_FONT * 0.5 - (n - 1) * axisLine,
        y: (box.py0 + box.py1) / 2 - tw / 2,
        w: AXIS_FONT + (n - 1) * axisLine,
        h: tw,
      });
    }
    if (xTitleLines.length) {
      const tw = Math.max(
        ...xTitleLines.map((line) => estimateTextWidthPx(line, AXIS_FONT, 0.2)),
      );
      const n = xTitleLines.length;
      rects.push({
        id: "xTitle",
        x: (box.px0 + box.px1) / 2 - tw / 2,
        y: xTitleY - AXIS_FONT * 0.75,
        w: tw,
        h: AXIS_FONT + (n - 1) * axisLine,
      });
    }
    if (extras.colorbar) {
      rects.push({
        id: "cbar",
        x: cbarX,
        y: box.py0,
        w: toScene(10 + 4 + cbarLabelW),
        h: Math.max(8, box.py1 - box.py0),
      });
    }
    if (extras.legendAt && extras.legendAt !== "inside") {
      for (const [i, key] of keys.entries()) {
        const lines = legendLines[i] ?? [key];
        const tw = Math.max(
          ...lines.map((line) => estimateTextWidthPx(line, TICK_FONT, 0.1)),
        );
        const x = extras.legendAt === "bottom" ? legendX + i * legendStep : legendX;
        const y = extras.legendAt === "bottom" ? legendY : legendY + i * legendStep;
        rects.push({
          id: `legend-${i}`,
          x,
          y: y - 6,
          w: toScene(14) + tw,
          h: TICK_FONT + 4 + (lines.length - 1) * legendLine,
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

  if (panel && title && collide("title", "panel-label")) {
    titleX = panel.x + panel.w + gap;
    rects = build();
  }
  if (title) {
    const maxW = Math.max(TITLE_FONT * 4, box.px1 - titleX - 4);
    titleLines = wrapTextLines(title, maxW, TITLE_FONT, 0.35, 3);
    if (!titleLines.length) titleLines = [title];
    if (titleLines.length > 1) {
      titleY -= (titleLines.length - 1) * (TITLE_FONT + 2);
    }
    rects = build();
  }
  if (xCap) {
    const maxW = Math.max(AXIS_FONT * 4, box.px1 - box.px0);
    xTitleLines = wrapTextLines(xCap, maxW, AXIS_FONT, 0.2, 3);
    if (!xTitleLines.length) xTitleLines = [xCap];
    rects = build();
  }
  if (yCap) {
    const maxW = Math.max(AXIS_FONT * 4, box.py1 - box.py0);
    yTitleLines = wrapTextLines(yCap, maxW, AXIS_FONT, 0.2, 3);
    if (!yTitleLines.length) yTitleLines = [yCap];
    rects = build();
  }
  if (yCap && yTicks.length && collide("yTitle", "ytick-")) {
    const tickLeft = Math.min(...rects.filter((r) => r.id.startsWith("ytick-")).map((r) => r.x));
    yTitleX = tickLeft - gap - AXIS_FONT * 0.5;
    rects = build();
  }
  if (xCap && xTicks.length && collide("xTitle", "xtick-")) {
    const tickBot = Math.max(...rects.filter((r) => r.id.startsWith("xtick-")).map((r) => r.y + r.h));
    xTitleY = tickBot + gap + AXIS_FONT * 0.75;
    rects = build();
  }
  if (extras.colorbar && extras.legendAt === "right" && collide("legend-", "cbar")) {
    const cbar = rects.find((r) => r.id === "cbar");
    if (cbar) {
      legendX = cbar.x + cbar.w + gap;
      rects = build();
    }
  }
  if (extras.legendAt === "bottom" && xCap && collide("legend-", "xTitle")) {
    legendY = xTitleY + toScene(AXIS_FONT + gap) + (xTitleLines.length - 1) * axisLine;
    rects = build();
  }
  if (keys.length && extras.legendAt && extras.legendAt !== "inside") {
    const swatch = toScene(14);
    const padW = toScene(6);
    const maxW =
      extras.legendAt === "bottom"
        ? Math.max(TICK_FONT * 5, legendStep - swatch - padW)
        : cell
          ? Math.max(TICK_FONT * 5, cell.x1 - legendX - swatch - padW)
          : toScene(compact ? 52 : 72);
    legendLines = keys.map((key) => {
      const lines = wrapTextLines(key, maxW, TICK_FONT, 0.1, 2);
      return lines.length ? lines : [key];
    });
    const extra = Math.max(0, ...legendLines.map((lines) => lines.length - 1));
    if (extras.legendAt !== "bottom" && extra > 0) {
      legendStep = toScene(14) + extra * legendLine;
    }
    rects = build();
  }

  return {
    chrome: {
      yTickX,
      xTickY,
      yTitleX,
      xTitleY,
      titleX,
      titleY,
      titleLines,
      xTitleLines,
      yTitleLines,
      legendLines,
      legendX,
      legendY,
      legendStep,
      cbarX,
      compact,
    },
    rects,
  };
}

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
      if (!rectsOverlap(a, b, 2)) continue;
      const pair = `${a.id} ${b.id}`;
      const leftish = /yTitle|ytick|panel-label/.test(pair);
      const rightish = /cbar|legend-/.test(pair);
      const topish = /title|panel-label/.test(pair);
      const botish = /xTitle|xtick|legend-/.test(pair);
      const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + 2;
      const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + 2;
      if (leftish) out.l = Math.max(out.l, overlapW * 0.5);
      if (rightish) out.r = Math.max(out.r, overlapW * 0.5);
      if (topish) out.t = Math.max(out.t, overlapH * 0.5);
      if (botish) out.b = Math.max(out.b, overlapH * 0.5);
    }
  }
  return out;
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
          if (dx > 0) out.r = Math.max(out.r, overlapW * 0.5);
          else out.l = Math.max(out.l, overlapW * 0.5);
        } else {
          if (dy > 0) out.b = Math.max(out.b, overlapH * 0.5);
          else out.t = Math.max(out.t, overlapH * 0.5);
        }
      }
    }
  }
  return out;
}
