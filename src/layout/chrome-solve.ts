/** Simultaneous inset residual: title / axis / legend / colorbar / (a) in one step. */

import {
  clampChartInsets,
  growInsetsForChrome,
  growInsetsForNeighbors,
  type CellBox,
  type ChromeRect,
  type InsetBox,
  type NeighborChrome,
  type PlotFloor,
} from "./chrome-collide.js";

export type ChromePlace = (insets: InsetBox) => { rects: ChromeRect[] } | null;

export type SolveInsetsOpts = {
  cell: CellBox;
  floor: InsetBox;
  pad: number;
  plotFloor?: PlotFloor;
  neighbors?: NeighborChrome[];
  place: ChromePlace;
  iters?: number;
};

/**
 * One residual vector per iteration: cell overflow, same-side chrome
 * overlap, and neighbor collisions. Not a sequential pairwise nudge.
 */
export function solveChartInsets(opts: SolveInsetsOpts): InsetBox {
  const cellW = Math.max(1, opts.cell.x1 - opts.cell.x0);
  const cellH = Math.max(1, opts.cell.y1 - opts.cell.y0);
  let insets = clampChartInsets(opts.floor, cellW, cellH, opts.floor, opts.plotFloor);
  const iters = opts.iters ?? 16;
  for (let i = 0; i < iters; i++) {
    const layout = opts.place(insets);
    if (!layout) break;
    const chrome = growInsetsForChrome(layout.rects, opts.cell, opts.pad);
    const neighbor = opts.neighbors?.length
      ? growInsetsForNeighbors(layout.rects, opts.cell, opts.neighbors, opts.pad)
      : { l: 0, r: 0, t: 0, b: 0 };
    const grow = {
      l: Math.max(chrome.l, neighbor.l),
      r: Math.max(chrome.r, neighbor.r),
      t: Math.max(chrome.t, neighbor.t),
      b: Math.max(chrome.b, neighbor.b),
    };
    if (grow.l <= 0.5 && grow.r <= 0.5 && grow.t <= 0.5 && grow.b <= 0.5) break;
    insets = clampChartInsets(
      {
        l: insets.l + grow.l,
        r: insets.r + grow.r,
        t: insets.t + grow.t,
        b: insets.b + grow.b,
      },
      cellW,
      cellH,
      opts.floor,
      opts.plotFloor,
    );
  }
  return insets;
}

export type PanelPlan = {
  cell: CellBox;
  insets: InsetBox;
  floor: InsetBox;
  plotFloor?: PlotFloor;
};

export type PanelLayout = {
  cell: CellBox;
  rects: ChromeRect[];
};

/**
 * All figure panels share one residual step. A neighbor push is applied
 * in the same iteration as chrome overflow, not a later pass.
 */
export function solveFigureInsets(
  plans: PanelPlan[],
  place: (plan: PanelPlan) => ChromeRect[],
  pad: number,
  iters = 8,
): PanelPlan[] {
  const next = plans.map((plan) => ({
    ...plan,
    insets: { ...plan.insets },
  }));
  for (let iter = 0; iter < iters; iter++) {
    const layouts: PanelLayout[] = next.map((plan) => ({
      cell: plan.cell,
      rects: place(plan),
    }));
    let grew = false;
    const updates: InsetBox[] = next.map((plan, i) => {
      const neighbors: NeighborChrome[] = layouts
        .filter((_, j) => j !== i)
        .map((layout) => ({ cell: layout.cell, rects: layout.rects }));
      const chrome = growInsetsForChrome(layouts[i]!.rects, plan.cell, pad);
      const neighbor = growInsetsForNeighbors(layouts[i]!.rects, plan.cell, neighbors, pad);
      return {
        l: Math.max(chrome.l, neighbor.l),
        r: Math.max(chrome.r, neighbor.r),
        t: Math.max(chrome.t, neighbor.t),
        b: Math.max(chrome.b, neighbor.b),
      };
    });
    for (let i = 0; i < next.length; i++) {
      const plan = next[i]!;
      const grow = updates[i]!;
      if (grow.l <= 0.5 && grow.r <= 0.5 && grow.t <= 0.5 && grow.b <= 0.5) continue;
      const cellW = Math.max(1, plan.cell.x1 - plan.cell.x0);
      const cellH = Math.max(1, plan.cell.y1 - plan.cell.y0);
      const clamped = clampChartInsets(
        {
          l: plan.insets.l + grow.l,
          r: plan.insets.r + grow.r,
          t: plan.insets.t + grow.t,
          b: plan.insets.b + grow.b,
        },
        cellW,
        cellH,
        plan.floor,
        plan.plotFloor,
      );
      if (
        clamped.l - plan.insets.l > 0.4 ||
        clamped.r - plan.insets.r > 0.4 ||
        clamped.t - plan.insets.t > 0.4 ||
        clamped.b - plan.insets.b > 0.4
      ) {
        plan.insets = clamped;
        grew = true;
      }
    }
    if (!grew) break;
  }
  return next;
}
