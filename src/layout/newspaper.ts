/** Body + figure blocks share one column-measure document stream. */

import { COLUMN_MM, pageColumnMeasure } from "../space/scene-box.js";
import { packCopyLinesToColumns, type CopyColumn, type CopyFlow } from "./copy-flow.js";

export type NewspaperFigure = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type NewspaperMeasure = {
  x: number;
  colW: number;
  gutter: number;
  cols: number;
  pageH: number;
  topReserve: number;
  bottomReserve: number;
  gap: number;
};

/**
 * Nature-style column measure: 89 mm single / 183 mm double on the sheet,
 * then N prose columns inside that text block. Plugin layout, not a keyword.
 */
export function newspaperMeasure(opts: {
  pageW: number;
  pageH: number;
  column?: "single" | "double";
  cols?: number;
  bodyX?: number;
  bodyW?: number;
  gutter?: number;
  topReserve?: number;
  bottomReserve?: number;
  gap?: number;
}): NewspaperMeasure {
  const cols = Math.max(1, Math.floor(opts.cols ?? (opts.column === "single" ? 1 : 2)));
  const page = { name: "a4" as const, w: opts.pageW, h: opts.pageH };
  const named = pageColumnMeasure(page, opts.column);
  const x = named?.x ?? opts.bodyX ?? 0;
  const textW =
    named?.w ??
    (opts.column === "single"
      ? COLUMN_MM.single
      : opts.column === "double"
        ? COLUMN_MM.double
        : Math.max(opts.bodyW ?? opts.pageW, 8));
  const gutter =
    opts.gutter ??
    (cols > 1 && opts.bodyW != null
      ? Math.max(2, (textW - opts.bodyW * cols) / (cols - 1))
      : cols > 1
        ? 5
        : 0);
  const colW = cols <= 1 ? textW : Math.max(8, (textW - gutter * (cols - 1)) / cols);
  return {
    x,
    colW,
    gutter,
    cols,
    pageH: opts.pageH,
    topReserve: opts.topReserve ?? 0,
    bottomReserve: opts.bottomReserve ?? 0,
    gap: opts.gap ?? 4,
  };
}

/** Snap a figure to 1…N column spans on the measure. */
export function snapFigureToMeasure(
  fig: NewspaperFigure,
  measure: NewspaperMeasure,
): NewspaperFigure {
  const { x, colW, gutter, cols } = measure;
  const w = Math.max(1, fig.x1 - fig.x0);
  let span = 1;
  let best = Infinity;
  for (let n = 1; n <= cols; n++) {
    const want = n * colW + (n - 1) * gutter;
    const err = Math.abs(w - want);
    if (err < best) {
      best = err;
      span = n;
    }
  }
  let col = 0;
  let bestX = Infinity;
  for (let i = 0; i <= Math.max(0, cols - span); i++) {
    const cx = x + i * (colW + gutter);
    const err = Math.abs(fig.x0 - cx);
    if (err < bestX) {
      bestX = err;
      col = i;
    }
  }
  const x0 = x + col * (colW + gutter);
  const x1 = x0 + span * colW + (span - 1) * gutter;
  return { ...fig, x0, x1 };
}

/** Keep figures inside a page band before body is poured. */
export function pageFitFigures(
  figures: NewspaperFigure[],
  measure: NewspaperMeasure,
): NewspaperFigure[] {
  const { pageH, topReserve, bottomReserve } = measure;
  if (!(pageH > 0)) return figures.map((fig) => ({ ...fig }));
  const usable = Math.max(8, pageH - topReserve - bottomReserve);
  return figures.map((fig) => {
    const h = Math.min(usable, Math.max(1, fig.y1 - fig.y0));
    let y0 = fig.y0;
    for (let hop = 0; hop < 8; hop++) {
      const page = Math.max(0, Math.floor((y0 + 1e-6) / pageH));
      const pageTop = page * pageH;
      const pageBot = pageTop + pageH;
      const topNeed = page === 0 ? 0 : topReserve;
      if (y0 < pageTop + topNeed - 1e-6) {
        y0 = pageTop + topNeed;
        continue;
      }
      if (y0 + h > pageBot - bottomReserve + 1e-6) {
        y0 = pageBot + topReserve;
        continue;
      }
      break;
    }
    return { ...fig, y0, y1: y0 + h };
  });
}

/**
 * Split columns around figure holes so prose and figures share the page
 * instead of only hopping a page knife.
 */
export function punchColumnsAroundFigures(
  columns: CopyColumn[],
  figures: NewspaperFigure[],
  gap: number,
): CopyColumn[] {
  if (!columns.length) return [];
  if (!figures.length) return columns.map((c) => ({ ...c }));
  const out: CopyColumn[] = [];
  for (const col of columns) {
    const hits = figures
      .filter((fig) => rangesOverlap(col.x, col.x + (col.w ?? 1), fig.x0, fig.x1, gap))
      .sort((a, b) => a.y0 - b.y0);
    if (!hits.length) {
      out.push({ ...col });
      continue;
    }
    let y = col.y0;
    for (const fig of hits) {
      const top = fig.y0 - gap;
      const bot = fig.y1 + gap;
      if (top - y >= 2) out.push({ x: col.x, y0: y, y1: Math.min(col.y1, top), w: col.w });
      y = Math.max(y, bot);
    }
    if (col.y1 - y >= 2) out.push({ x: col.x, y0: y, y1: col.y1, w: col.w });
  }
  return out.length ? out : columns.map((c) => ({ ...c }));
}

export function packNewspaperCopy(
  lines: string[],
  columns: CopyColumn[],
  figures: NewspaperFigure[],
  opts: {
    lineH: number;
    pageH?: number;
    topReserve?: number;
    bottomReserve?: number;
    gap?: number;
  },
): CopyFlow {
  const punched = punchColumnsAroundFigures(columns, figures, opts.gap ?? 4);
  return packCopyLinesToColumns(lines, punched.length ? punched : columns, {
    lineH: opts.lineH,
    pageH: opts.pageH,
    topReserve: opts.topReserve,
    bottomReserve: opts.bottomReserve,
  });
}

export function hopFiguresPastCopy(
  figures: NewspaperFigure[],
  places: { x: number; y: number }[],
  opts: { gap?: number; lineH?: number; pageH?: number; topReserve?: number } = {},
): NewspaperFigure[] {
  const gap = opts.gap ?? 4;
  const lineH = opts.lineH ?? 4;
  const pageH = opts.pageH ?? 0;
  const topR = opts.topReserve ?? 0;
  return figures.map((fig) => {
    const hits = places.filter(
      (p) => rangesOverlap(fig.x0, fig.x1, p.x, p.x + 1, gap) && p.y >= fig.y0 - gap && p.y <= fig.y1 + gap,
    );
    if (!hits.length) return { ...fig };
    const h = fig.y1 - fig.y0;
    let y0 = Math.max(...hits.map((p) => p.y)) + lineH + gap;
    if (pageH > 0) {
      const page = Math.max(0, Math.floor((y0 + 1e-6) / pageH));
      const pageBot = (page + 1) * pageH;
      if (y0 + h > pageBot - 4) y0 = pageBot + topR;
    }
    return { ...fig, y0, y1: y0 + h };
  });
}

/**
 * One compose pass: snap figures to the column measure, page-fit them,
 * pour body around the final boxes, hop+repack if copy still collides.
 */
export function composeNewspaper(
  lines: string[],
  figures: NewspaperFigure[],
  columns: CopyColumn[],
  measure: NewspaperMeasure,
  opts: { lineH: number },
): {
  places: CopyFlow["places"];
  figures: NewspaperFigure[];
  columns: CopyColumn[];
  bottom: number;
} {
  const snapped = figures.map((fig) =>
    overlapsMeasure(fig, measure) ? snapFigureToMeasure(fig, measure) : { ...fig },
  );
  const fitted = pageFitFigures(snapped, measure);
  const packOnce = (figs: NewspaperFigure[]) => {
    const punched = punchColumnsAroundFigures(columns, figs, measure.gap);
    const packed = packCopyLinesToColumns(lines, punched.length ? punched : columns, {
      lineH: opts.lineH,
      pageH: measure.pageH,
      topReserve: measure.topReserve,
      bottomReserve: measure.bottomReserve,
    });
    return { punched, packed };
  };
  const first = packOnce(fitted);
  const hopped = hopFiguresPastCopy(fitted, first.packed.places, {
    gap: measure.gap,
    lineH: opts.lineH,
    pageH: measure.pageH,
    topReserve: measure.topReserve,
  });
  const moved = hopped.some((fig, i) => Math.abs(fig.y0 - fitted[i]!.y0) > 0.5);
  if (!moved) {
    return {
      places: first.packed.places,
      figures: fitted,
      columns: first.punched,
      bottom: first.packed.bottom,
    };
  }
  const second = packOnce(hopped);
  return {
    places: second.packed.places,
    figures: hopped,
    columns: second.punched,
    bottom: second.packed.bottom,
  };
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number, gap: number): boolean {
  return a0 < b1 + gap && b0 < a1 + gap;
}

function overlapsMeasure(fig: NewspaperFigure, measure: NewspaperMeasure): boolean {
  const x1 =
    measure.x + measure.cols * measure.colW + Math.max(0, measure.cols - 1) * measure.gutter;
  return rangesOverlap(fig.x0, fig.x1, measure.x, x1, measure.gap);
}
