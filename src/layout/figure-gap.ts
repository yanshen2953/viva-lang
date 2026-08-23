/** Default figure gutter/margin in scene units. Not a column typesetter. */

export function figureGapDefaults(opts: {
  unit: string;
  width: number;
  cols: number;
}): { gutter: number; margin: number } {
  if (opts.unit === "mm" || opts.unit === "pt") {
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
