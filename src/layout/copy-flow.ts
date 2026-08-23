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
