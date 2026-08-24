/** Flow wrapped copy across a page knife. Not a paragraph typesetter. */

export type CopyLinePlace = {
  text: string;
  x: number;
  y: number;
  page: number;
};

export type CopyFlow = {
  places: CopyLinePlace[];
  bottom: number;
  clipped: boolean;
};

/**
 * Place already-wrapped lines. With `pageH`, lines that would sit in the
 * folio band or straddle the knife hop to the next page. Without `pageH`,
 * lines stop at `hostBottom` (screen boards must not paint into the figure).
 */
export function packCopyLinesToPages(
  lines: string[],
  opts: {
    x: number;
    startY: number;
    lineH: number;
    pageH?: number;
    hostBottom?: number;
    topReserve?: number;
    bottomReserve?: number;
  },
): CopyFlow {
  const lineH = Math.max(0.5, opts.lineH);
  const pageH = opts.pageH && opts.pageH > 0 ? opts.pageH : 0;
  const topR = opts.topReserve ?? 0;
  const botR = opts.bottomReserve ?? 0;
  const places: CopyLinePlace[] = [];
  let y = opts.startY;

  const pageOf = (yy: number) => (pageH ? Math.max(0, Math.floor((yy + 1e-6) / pageH)) : 0);

  const hopIfNeeded = (yy: number): number => {
    if (!pageH) return yy;
    for (let hop = 0; hop < 12; hop++) {
      const page = Math.max(0, Math.floor((yy + 1e-6) / pageH));
      const pageTop = page * pageH;
      const pageBot = pageTop + pageH;
      const topNeed = page === 0 ? 0 : topR;
      if (yy < pageTop + topNeed - 1e-6) {
        yy = pageTop + topNeed;
        continue;
      }
      if (yy + lineH > pageBot - botR + 1e-6) {
        yy = pageBot + topR;
        continue;
      }
      break;
    }
    return yy;
  };

  const overflowsHost = (yy: number) =>
    !pageH && opts.hostBottom !== undefined && yy + lineH > opts.hostBottom + 1e-6;

  let clipped = false;
  for (const text of lines) {
    if (overflowsHost(y)) {
      clipped = true;
      break;
    }
    y = hopIfNeeded(y);
    if (overflowsHost(y)) {
      clipped = true;
      break;
    }
    places.push({ text, x: opts.x, y, page: pageOf(y) });
    y += lineH;
  }

  const bottom = places.length ? places[places.length - 1]!.y + lineH : opts.startY;
  return { places, bottom, clipped };
}

export type CopyColumn = {
  x: number;
  y0: number;
  y1: number;
  w?: number;
};

/** How many readable prose columns a type grid should fill. 12 guides → 3 measures. */
export function readableTypeColCount(typeCols: number): number {
  if (typeCols <= 1) return 1;
  if (typeCols <= 3) return typeCols;
  if (typeCols <= 6) return 2;
  return 3;
}

/**
 * Fill columns top-to-bottom, then left-to-right. With `pageH`, exhausted
 * columns hop to the same x on the next slice. Not InDesign.
 */
export function packCopyLinesToColumns(
  lines: string[],
  columns: CopyColumn[],
  opts: {
    lineH: number;
    pageH?: number;
    topReserve?: number;
    bottomReserve?: number;
  },
): CopyFlow {
  const lineH = Math.max(0.5, opts.lineH);
  const pageH = opts.pageH && opts.pageH > 0 ? opts.pageH : 0;
  const topR = opts.topReserve ?? 0;
  const botR = opts.bottomReserve ?? 0;
  const places: CopyLinePlace[] = [];
  if (!columns.length) return { places, bottom: 0, clipped: lines.length > 0 };

  const boxOf = (col: CopyColumn, page: number): CopyColumn => {
    if (!pageH || page <= 0) {
      return pageH
        ? { x: col.x, y0: col.y0, y1: Math.min(col.y1, pageH - botR), w: col.w }
        : col;
    }
    return {
      x: col.x,
      y0: page * pageH + topR,
      y1: (page + 1) * pageH - botR,
      w: col.w,
    };
  };

  let colI = 0;
  let page = 0;
  let y = boxOf(columns[0]!, 0).y0;
  let clipped = false;

  for (const text of lines) {
    let placed = false;
    for (let hop = 0; hop < 64 && !placed; hop++) {
      const col = columns[colI]!;
      const box = boxOf(col, page);
      if (y < box.y0) y = box.y0;
      if (y + lineH <= box.y1 + 1e-6) {
        places.push({ text, x: box.x, y, page });
        y += lineH;
        placed = true;
        break;
      }
      colI += 1;
      if (colI >= columns.length) {
        if (!pageH) break;
        colI = 0;
        page += 1;
      }
      y = boxOf(columns[colI]!, page).y0;
    }
    if (!placed) {
      clipped = true;
      break;
    }
  }

  const bottom = places.length ? places[places.length - 1]!.y + lineH : columns[0]!.y0;
  return { places, bottom, clipped };
}
