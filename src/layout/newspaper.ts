/** Body + figure blocks share a page stream. Still plugin layout, not InDesign. */

import { packCopyLinesToColumns, type CopyColumn, type CopyFlow } from "./copy-flow.js";

export type NewspaperFigure = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

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

function rangesOverlap(a0: number, a1: number, b0: number, b1: number, gap: number): boolean {
  return a0 < b1 + gap && b0 < a1 + gap;
}
