import { COLUMN_MM } from "../space/scene-box.js";

/** Default figure gutter/margin/title bands in scene units. Not a column typesetter. */

export function figureGapDefaults(opts: {
  unit: string;
  width: number;
  cols: number;
}): { gutter: number; margin: number } {
  if (opts.unit === "mm" || opts.unit === "pt") {
    if (opts.cols >= 2 && Math.abs(opts.width - COLUMN_MM.double) < 0.6) {
      return { gutter: COLUMN_MM.double - COLUMN_MM.single * 2, margin: 0 };
    }
    return {
      gutter: opts.cols >= 2 ? 2.4 : 3,
      margin: 1.6,
    };
  }
  const width = Math.max(1, opts.width);
  return {
    gutter: Math.max(10, Math.min(28, Math.round(width * 0.035))),
    margin: Math.max(6, Math.min(16, Math.round(width * 0.02))),
  };
}

export function figureCopyDefaults(opts: {
  unit: string;
  hasTitle: boolean;
  hasSubtitle: boolean;
  hasCaption: boolean;
}): { titleH: number; capH: number; headGap: number; footGap: number; minGrid: number } {
  if (opts.unit === "mm" || opts.unit === "pt") {
    return {
      titleH: opts.hasTitle ? (opts.hasSubtitle ? 7 : 4.5) : 0,
      capH: opts.hasCaption ? 3.5 : 0,
      headGap: opts.hasTitle ? 1 : 0,
      footGap: opts.hasCaption ? 0.8 : 0,
      minGrid: 12,
    };
  }
  return {
    titleH: opts.hasTitle ? (opts.hasSubtitle ? 40 : 24) : 0,
    capH: opts.hasCaption ? 20 : 0,
    headGap: opts.hasTitle ? 6 : 0,
    footGap: opts.hasCaption ? 4 : 0,
    minGrid: 32,
  };
}

export function figureCopyPlace(opts: {
  unit: string;
  originX: number;
  originY: number;
  width: number;
  height: number;
  titleH: number;
  capH: number;
  hasSubtitle: boolean;
}): { titleX: number; titleY: number; titleW: number; subY: number; capY: number } {
  if (opts.unit === "mm" || opts.unit === "pt") {
    return {
      titleX: opts.originX + 1.2,
      titleY: opts.originY + (opts.hasSubtitle ? 2.4 : Math.min(3.2, opts.titleH * 0.7)),
      titleW: Math.max(8, opts.width - 2.4),
      subY: opts.originY + Math.max(4.2, opts.titleH - 1.2),
      capY: opts.originY + opts.height - Math.max(1.6, opts.capH - 0.6),
    };
  }
  return {
    titleX: opts.originX + 10,
    titleY: opts.originY + (opts.hasSubtitle ? 16 : Math.min(18, opts.titleH * 0.7)),
    titleW: Math.max(40, opts.width - 20),
    subY: opts.originY + Math.max(30, opts.titleH - 8),
    capY: opts.originY + opts.height - Math.max(12, opts.capH - 4),
  };
}
