/** Keep figure cells off a scene page knife. Not a column typesetter. */

export type FigurePageCell = {
  name: string;
  cellX0: number;
  cellY0: number;
  cellW: number;
  cellH: number;
};

export type FigurePagePack = {
  cells: FigurePageCell[];
  bottom: number;
};

/** Scene-unit folio bands so cells do not sit under n/N or "(continued)". */
export function figurePageReserves(unit: string): { pad: number; top: number; bottom: number } {
  if (unit === "mm" || unit === "pt") {
    return { pad: 3, top: 6, bottom: 5 };
  }
  return { pad: 14, top: 28, bottom: 22 };
}

/**
 * Push rows that would straddle a page break onto the next page.
 * Keeps cell sizes unless a cell is taller than the usable page.
 * Later rows keep their original relative spacing plus the accumulated shift.
 */
export function packFigureCellsToPages(
  cells: FigurePageCell[],
  opts: { pageH: number; topReserve: number; bottomReserve: number },
): FigurePagePack {
  const bottomOf = (list: FigurePageCell[]) =>
    list.reduce((max, cell) => Math.max(max, cell.cellY0 + cell.cellH), 0);
  if (!(opts.pageH > 0) || cells.length === 0) {
    return { cells: cells.map((cell) => ({ ...cell })), bottom: bottomOf(cells) };
  }

  const rows = groupRows(cells);
  let shift = 0;
  const out: FigurePageCell[] = [];
  const usable = Math.max(8, opts.pageH - opts.topReserve - opts.bottomReserve);

  for (const row of rows) {
    const rawH = row[0]!.cellH;
    const cellH = rawH > usable ? usable : rawH;
    let y0 = row[0]!.cellY0 + shift;
    for (let hop = 0; hop < 6; hop++) {
      const pageIndex = Math.max(0, Math.floor((y0 + 1e-6) / opts.pageH));
      const pageTop = pageIndex * opts.pageH;
      const pageBot = pageTop + opts.pageH;
      const topNeed = pageIndex === 0 ? 0 : opts.topReserve;
      if (y0 < pageTop + topNeed - 1e-6) {
        const extra = pageTop + topNeed - y0;
        shift += extra;
        y0 += extra;
        continue;
      }
      if (y0 + cellH > pageBot - opts.bottomReserve + 1e-6) {
        const nextTop = pageBot + opts.topReserve;
        const extra = nextTop - y0;
        if (extra <= 1e-6) break;
        shift += extra;
        y0 += extra;
        continue;
      }
      break;
    }
    for (const cell of row) {
      out.push({ ...cell, cellY0: y0, cellH });
    }
  }

  return { cells: out, bottom: bottomOf(out) };
}

function groupRows(cells: FigurePageCell[]): FigurePageCell[][] {
  const buckets = new Map<number, FigurePageCell[]>();
  for (const cell of cells) {
    const key = Math.round(cell.cellY0 * 100) / 100;
    const row = buckets.get(key);
    if (row) row.push(cell);
    else buckets.set(key, [cell]);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row);
}
