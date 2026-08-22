import {
  binary,
  ident,
  literal,
  type Artifact,
  type Expr,
  type LayerDecl,
  type SceneItem,
  type Statement,
} from "./ast.js";

export function expandWidgets(artifact: Artifact): Artifact {
  const next = structuredClone(artifact);
  if (!next.scene) {
    next.scene = { props: {}, layers: [], span: artifact.span };
  }

  let chartIndex = 0;
  for (const widget of next.widgets) {
    if (widget.name === "timeline") {
      expandTimeline(next, widget.props);
    } else if (
      widget.name === "chart.scatter" ||
      widget.name === "chart.line" ||
      widget.name === "chart.bar"
    ) {
      chartIndex += 1;
      expandChart(next, widget.name, widget.props, chartIndex);
    }
  }
  return next;
}

function expandTimeline(artifact: Artifact, props: Record<string, Expr>): void {
  const from = props.from ?? literal(0);
  const to = props.to ?? literal(100);
  const bindName =
    props.bind?.kind === "ident" ? props.bind.path.join(".") : "year";
  const span = artifact.span;

  const layer: LayerDecl = {
    name: "__timeline",
    span,
    props: {},
    items: [
      node("timelineTrack", {
        x: literal(40),
        y: literal(430),
        w: literal(720),
        h: literal(8),
        fill: literal("#334155"),
        radius: literal(4),
      }),
      node("timelineFill", {
        x: literal(40),
        y: literal(430),
        w: binary(
          "*",
          literal(720),
          binary(
            "/",
            binary("-", ident(bindName), from, span),
            binary("-", to, from, span),
            span,
          ),
          span,
        ),
        h: literal(8),
        fill: literal("#f59e0b"),
        radius: literal(4),
      }),
      node("timelineLabel", {
        x: literal(40),
        y: literal(412),
        text: ident(bindName),
        fill: literal("#e2e8f0"),
        font: literal(14),
      }),
    ],
  };

  artifact.scene?.layers.push(layer);
  artifact.events.push({
    type: "click",
    target: "timelineTrack",
    body: [
      assign(
        bindName.split("."),
        binary(
          "+",
          from,
          binary("*", binary("-", to, from, span), ident("__event.t"), span),
          span,
        ),
      ),
    ],
    span,
  });
}

function expandChart(
  artifact: Artifact,
  kind: string,
  props: Record<string, Expr>,
  index: number,
): void {
  const span = artifact.span;
  const frameName =
    props.frame?.kind === "ident"
      ? props.frame.path.join(".")
      : props.frame?.kind === "string"
        ? props.frame.value
        : `__chart_${index}`;

  const hasNamedFrame = artifact.frames.some((f) => f.name === frameName);
  if (!hasNamedFrame) {
    artifact.frames.push({
      name: frameName,
      span,
      props: {
        x: props.areaX ?? props.x ?? literal([72, 720]),
        y: props.areaY ?? props.y ?? literal([60, 400]),
        xlim: props.xlim ?? literal([0, 10]),
        ylim: props.ylim ?? literal([0, 100]),
      },
    });
  }

  const dataName =
    props.data?.kind === "ident"
      ? props.data.path.join(".")
      : props.source?.kind === "ident"
        ? props.source.path.join(".")
        : "series";
  const xField =
    props.xField?.kind === "ident"
      ? props.xField.path[0]!
      : props.xField?.kind === "string"
        ? props.xField.value
        : fieldName(props.xField ?? props.x, "x");
  const yField =
    props.yField?.kind === "ident"
      ? props.yField.path[0]!
      : props.yField?.kind === "string"
        ? props.yField.value
        : fieldName(props.yField ?? props.y, "y");

  // If x/y were used as area pairs for frame, field defaults stay x/y.
  const useAreaPairs = props.areaX !== undefined || props.areaY !== undefined;
  const resolvedXField = useAreaPairs || props.x?.kind === "array" ? fieldName(props.xField, "x") : xField;
  const resolvedYField = useAreaPairs || props.y?.kind === "array" ? fieldName(props.yField, "y") : yField;

  const title =
    props.title?.kind === "string"
      ? props.title.value
      : kind.replace("chart.", "").toUpperCase();

  const titleX = pairAt(props.areaX ?? props.x, 0, 72);
  const titleYExpr = (() => {
    const top = pairAt(props.areaY ?? props.y, 0, 60);
    if (top.kind === "number") return literal(Math.max(24, top.value - 24));
    return literal(36);
  })();

  const area = areaRect(props, span);
  const seriesField = seriesFieldName(props);
  const markProps = markSeriesProps(props, seriesField);

  const axisItems: SceneItem[] = [
    node(`${frameName}_plotBg`, {
      role: literal("plot"),
      x: area.x,
      y: area.y,
      w: area.w,
      h: area.h,
      radius: literal(6),
      ...(props.plotFill ? { fill: props.plotFill } : {}),
      ...(props.plotStroke ? { stroke: props.plotStroke } : {}),
      ...(props.plotStrokeWidth ? { strokeWidth: props.plotStrokeWidth } : {}),
      ...(props.plotOpacity ? { opacity: props.plotOpacity } : {}),
    }),
    ...expandGridLines(frameName, props, span),
    ...expandAxisTicks(frameName, props, span),
    node(`${frameName}_xAxis`, {
      role: literal("axis"),
      frame: literal(frameName),
      x1: xlimLow(props),
      y1: ylimLow(props),
      x2: xlimHigh(props),
      y2: ylimLow(props),
      ...(props.axisColor ?? props.axisStroke ? { stroke: props.axisColor ?? props.axisStroke! } : {}),
    }),
    node(`${frameName}_yAxis`, {
      role: literal("axis"),
      frame: literal(frameName),
      x1: xlimLow(props),
      y1: ylimLow(props),
      x2: xlimLow(props),
      y2: ylimHigh(props),
      ...(props.axisColor ?? props.axisStroke ? { stroke: props.axisColor ?? props.axisStroke! } : {}),
    }),
    node(`${frameName}_title`, {
      role: literal("title"),
      x: titleX,
      y: titleYExpr,
      text: literal(title),
    }),
    ...(seriesField && !props.legend?.kind
      ? expandSeriesLegend(frameName, artifact, dataName, seriesField, props, span)
      : []),
  ];

  const axisLayer: LayerDecl = {
    name: `__${frameName}_axes`,
    span,
    props: {},
    items: axisItems,
  };

  const marks: SceneItem[] = [];
  const explicitFill = props.color ?? props.fill;
  const explicitStroke = props.stroke;
  if (kind === "chart.scatter") {
    marks.push({
      kind: "for",
      item: "row",
      source: ident(dataName),
      span,
      body: [
        node("mark", {
          role: literal("mark"),
          frame: literal(frameName),
          x: ident(`row.${resolvedXField}`),
          y: ident(`row.${resolvedYField}`),
          r: props.r ?? literal(3.5),
          ...markProps,
          ...(explicitFill ? { fill: explicitFill } : {}),
          ...(props.markStroke ?? props.barStroke
            ? { stroke: props.markStroke ?? props.barStroke! }
            : {}),
          ...(props.markStrokeWidth ?? props.barStrokeWidth
            ? { strokeWidth: props.markStrokeWidth ?? props.barStrokeWidth! }
            : {}),
          ...(props.hoverFill ? { hoverFill: props.hoverFill } : {}),
        }),
      ],
    });
  } else if (kind === "chart.line") {
    marks.push({
      kind: "for",
      item: "row",
      source: ident(dataName),
      span,
      body: [
        node("linePt", {
          role: literal("mark"),
          frame: literal(frameName),
          x: ident(`row.${resolvedXField}`),
          y: ident(`row.${resolvedYField}`),
          r: props.r ?? literal(3),
          ...markProps,
          ...(explicitFill ? { fill: explicitFill } : {}),
          ...(props.markStroke ? { stroke: props.markStroke } : {}),
          ...(props.markStrokeWidth ? { strokeWidth: props.markStrokeWidth } : {}),
        }),
      ],
    });
    marks.push(
      ...expandLineSegments(
        artifact,
        dataName,
        resolvedXField,
        resolvedYField,
        frameName,
        explicitStroke ?? explicitFill,
        span,
        seriesField,
      ),
    );
  } else if (kind === "chart.bar") {
    const barW = barWidthData(props);
    if (seriesField) {
      applyGroupedBarDodge(artifact, dataName, resolvedXField, seriesField, barW);
    }
    const xExpr = seriesField
      ? binary("+", ident(`row.${resolvedXField}`), ident("row.__dodge"), span)
      : ident(`row.${resolvedXField}`);
    marks.push({
      kind: "for",
      item: "row",
      source: ident(dataName),
      span,
      body: [
        node("bar", {
          role: literal("mark"),
          frame: literal(frameName),
          x: xExpr,
          y: ident(`row.${resolvedYField}`),
          w: seriesField ? ident("row.__barW") : props.barWidth ?? literal(barW),
          h: ident(`row.${resolvedYField}`),
          ...markProps,
          ...(explicitFill ? { fill: explicitFill } : markFill(props) ? { fill: markFill(props)! } : {}),
          ...(props.barStroke ?? props.markStroke
            ? { stroke: props.barStroke ?? props.markStroke! }
            : markStroke(props)
              ? { stroke: markStroke(props)! }
              : {}),
          ...(props.barStrokeWidth ?? props.markStrokeWidth
            ? { strokeWidth: props.barStrokeWidth ?? props.markStrokeWidth! }
            : {}),
          ...(props.barRadius ? { radius: props.barRadius } : { radius: literal(3) }),
          __chartBar: literal(true),
        }),
      ],
    });
  }

  const markLayer: LayerDecl = {
    name: `__${frameName}_marks`,
    span,
    props: {},
    items: marks,
  };

  artifact.scene?.layers.push(axisLayer, markLayer);
}

function expandLineSegments(
  artifact: Artifact,
  dataName: string,
  xField: string,
  yField: string,
  frameName: string,
  stroke: Expr | undefined,
  span: { line: number; column: number },
  seriesField?: string | null,
): SceneItem[] {
  const decl = artifact.data.find((d) => d.name === dataName);
  if (!decl || decl.value.kind !== "array") return [];
  const rows = decl.value.items;

  if (seriesField) {
    const groups = new Map<string, Extract<Expr, { kind: "object" }>[]>();
    for (const row of rows) {
      if (row.kind !== "object") continue;
      const sv = objectField(row, seriesField);
      const key =
        sv?.kind === "number"
          ? String(sv.value)
          : sv?.kind === "string"
            ? sv.value
            : "default";
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    const items: SceneItem[] = [];
    let seg = 0;
    for (const [gkey, grows] of groups) {
      for (let i = 0; i < grows.length - 1; i++) {
        const a = grows[i]!;
        const b = grows[i + 1]!;
        const ax = objectField(a, xField);
        const ay = objectField(a, yField);
        const bx = objectField(b, xField);
        const by = objectField(b, yField);
        if (!ax || !ay || !bx || !by) continue;
        items.push(
          node(`seg_${seg++}`, {
            role: literal("mark-line"),
            frame: literal(frameName),
            x1: ax,
            y1: ay,
            x2: bx,
            y2: by,
            ...(stroke
              ? { stroke }
              : {
                  stroke: {
                    kind: "call",
                    callee: "palette",
                    args: [
                      { kind: "string", value: gkey, span: span },
                      { kind: "string", value: "categorical", span: span },
                    ],
                    span,
                  },
                }),
            strokeWidth: literal(2),
            strokeLinecap: literal("round"),
          }),
        );
      }
    }
    return items;
  }

  const items: SceneItem[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i]!;
    const b = rows[i + 1]!;
    if (a.kind !== "object" || b.kind !== "object") continue;
    const ax = objectField(a, xField);
    const ay = objectField(a, yField);
    const bx = objectField(b, xField);
    const by = objectField(b, yField);
    if (!ax || !ay || !bx || !by) continue;
    items.push(
      node(`seg_${i}`, {
        role: literal("mark-line"),
        frame: literal(frameName),
        x1: ax,
        y1: ay,
        x2: bx,
        y2: by,
        ...(stroke ? { stroke } : {}),
        strokeWidth: literal(2),
        strokeLinecap: literal("round"),
      }),
    );
  }
  return items;
}

function objectField(
  obj: Extract<Expr, { kind: "object" }>,
  key: string,
): Expr | null {
  return obj.entries.find((e) => e.key === key)?.value ?? null;
}

function setObjectField(
  obj: Extract<Expr, { kind: "object" }>,
  key: string,
  value: Expr,
): void {
  const existing = obj.entries.find((e) => e.key === key);
  if (existing) existing.value = value;
  else obj.entries.push({ key, value });
}

/** Offset grouped bars in data space so `group` series do not overlap. */
function applyGroupedBarDodge(
  artifact: Artifact,
  dataName: string,
  xField: string,
  seriesField: string,
  barWidth: number,
): void {
  const decl = artifact.data.find((d) => d.name === dataName);
  if (!decl || decl.value.kind !== "array") return;

  const byX = new Map<string, Extract<Expr, { kind: "object" }>[]>();
  for (const row of decl.value.items) {
    if (row.kind !== "object") continue;
    const xf = objectField(row, xField);
    const key =
      xf?.kind === "number"
        ? String(xf.value)
        : xf?.kind === "string"
          ? xf.value
          : "0";
    const list = byX.get(key) ?? [];
    list.push(row);
    byX.set(key, list);
  }

  for (const group of byX.values()) {
    const sorted = [...group].sort((a, b) => {
      const sa = objectField(a, seriesField);
      const sb = objectField(b, seriesField);
      const ka =
        sa?.kind === "string" ? sa.value : sa?.kind === "number" ? String(sa.value) : "";
      const kb =
        sb?.kind === "string" ? sb.value : sb?.kind === "number" ? String(sb.value) : "";
      return ka.localeCompare(kb);
    });
    const n = sorted.length;
    const step = n > 0 ? barWidth / n : barWidth;
    sorted.forEach((row, i) => {
      const dodge = (i - (n - 1) / 2) * step;
      setObjectField(row, "__dodge", literal(dodge));
      setObjectField(row, "__barW", literal(step));
    });
  }
}

function barWidthData(props: Record<string, Expr>): number {
  if (props.barWidth?.kind === "number") return props.barWidth.value;
  return 0.6;
}

function fieldName(expr: Expr | undefined, fallback: string): string {
  if (!expr) return fallback;
  if (expr.kind === "ident") return expr.path[expr.path.length - 1] ?? fallback;
  if (expr.kind === "string") return expr.value;
  return fallback;
}

function xlimLow(props: Record<string, Expr>): Expr {
  return pairAt(props.xlim, 0, 0);
}
function xlimHigh(props: Record<string, Expr>): Expr {
  return pairAt(props.xlim, 1, 10);
}
function ylimLow(props: Record<string, Expr>): Expr {
  return pairAt(props.ylim, 0, 0);
}
function ylimHigh(props: Record<string, Expr>): Expr {
  return pairAt(props.ylim, 1, 100);
}

function pairAt(expr: Expr | undefined, index: number, fallback: number): Expr {
  if (expr?.kind === "array" && expr.items[index]) return expr.items[index]!;
  if (expr?.kind === "number" && index === 1) return expr;
  return literal(fallback);
}

/** Series field for handbook palette (`group`, `colorField`, `series`). */
function seriesFieldName(props: Record<string, Expr>): string | null {
  const gf = props.group ?? props.groupField ?? props.series ?? props.colorField ?? props.fillField;
  if (!gf) return null;
  return fieldName(gf, "grp");
}

function markSeriesProps(
  props: Record<string, Expr>,
  seriesField: string | null,
): Record<string, Expr> {
  if (!seriesField) return {};
  const paletteKind =
    props.palette?.kind === "string" ? props.palette.value : "categorical";
  return {
    colorBy: literal(seriesField),
    palette: literal(paletteKind),
  };
}

/** Per-row fill when `colorField: fill` (legacy explicit row colors). */
function markFill(props: Record<string, Expr>): Expr | null {
  const cf = props.colorField ?? props.fillField;
  if (!cf) return null;
  const field = fieldName(cf, "fill");
  return ident(`row.${field}`);
}

/** Per-row stroke when `strokeField: stroke`. */
function markStroke(props: Record<string, Expr>): Expr | null {
  const sf = props.strokeField;
  if (!sf) return null;
  const field = fieldName(sf, "stroke");
  return ident(`row.${field}`);
}

function areaRect(
  props: Record<string, Expr>,
  span: { line: number; column: number },
): { x: Expr; y: Expr; w: Expr; h: Expr } {
  const x0 = pairAt(props.areaX ?? props.x, 0, 72);
  const x1 = pairAt(props.areaX ?? props.x, 1, 720);
  const y0 = pairAt(props.areaY ?? props.y, 0, 60);
  const y1 = pairAt(props.areaY ?? props.y, 1, 400);
  return {
    x: x0,
    y: y0,
    w: binary("-", x1, x0, span),
    h: binary("-", y1, y0, span),
  };
}

/** Horizontal grid lines in data space (frame coordinates). */
function expandGridLines(
  frameName: string,
  props: Record<string, Expr>,
  span: { line: number; column: number },
): SceneItem[] {
  const items: SceneItem[] = [];
  const yTicks = numericTicksFromProps(props, "y");
  if (yTicks.length >= 2) {
    for (let i = 0; i < yTicks.length; i++) {
      const y = literal(yTicks[i]!);
      items.push(
        node(`${frameName}_grid_y_${i}`, {
          role: literal("grid"),
          frame: literal(frameName),
          x1: xlimLow(props),
          y1: y,
          x2: xlimHigh(props),
          y2: y,
          ...(props.gridColor ? { stroke: props.gridColor } : {}),
          dash: literal("4 5"),
        }),
      );
    }
  } else {
    const fracs = [0.25, 0.5, 0.75];
    const yRange = binary("-", ylimHigh(props), ylimLow(props), span);
    for (let i = 0; i < fracs.length; i++) {
      const f = fracs[i]!;
      const y = binary(
        "+",
        ylimLow(props),
        binary("*", yRange, literal(f), span),
        span,
      );
      items.push(
        node(`${frameName}_grid_${i}`, {
          role: literal("grid"),
          frame: literal(frameName),
          x1: xlimLow(props),
          y1: y,
          x2: xlimHigh(props),
          y2: y,
          ...(props.gridColor ? { stroke: props.gridColor } : {}),
          dash: literal("4 5"),
        }),
      );
    }
  }
  const xTicks = numericTicksFromProps(props, "x");
  for (let i = 0; i < xTicks.length; i++) {
    const x = literal(xTicks[i]!);
    items.push(
      node(`${frameName}_grid_x_${i}`, {
        role: literal("grid"),
        frame: literal(frameName),
        x1: x,
        y1: ylimLow(props),
        x2: x,
        y2: ylimHigh(props),
        ...(props.gridColor ? { stroke: props.gridColor } : {}),
        dash: literal("4 5"),
      }),
    );
  }
  return items;
}

function numericPair(expr: Expr | undefined, fallback: [number, number]): [number, number] | null {
  if (expr?.kind === "array" && expr.items.length >= 2) {
    const a = expr.items[0];
    const b = expr.items[1];
    if (a?.kind === "number" && b?.kind === "number") return [a.value, b.value];
  }
  return fallback ? fallback : null;
}

function niceTicks(min: number, max: number, maxTicks = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const span = max - min;
  const rawStep = span / Math.max(1, maxTicks - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  let niceStep = magnitude;
  if (residual > 5) niceStep = 10 * magnitude;
  else if (residual > 2) niceStep = 5 * magnitude;
  else if (residual > 1) niceStep = 2 * magnitude;

  const tickMin = Math.floor(min / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = tickMin; v <= max + niceStep * 0.5; v += niceStep) {
    if (v >= min - niceStep * 0.01 && v <= max + niceStep * 0.01) ticks.push(v);
    if (ticks.length > 10) break;
  }
  return ticks;
}

function formatTickValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const r = Math.round(v * 100) / 100;
  return String(r);
}

function numericTicksFromProps(
  props: Record<string, Expr>,
  axis: "x" | "y",
): number[] {
  const lim = axis === "x" ? numericPair(props.xlim, [0, 10]) : numericPair(props.ylim, [0, 100]);
  if (!lim) return [];
  return niceTicks(lim[0], lim[1]);
}

function expandAxisTicks(
  frameName: string,
  props: Record<string, Expr>,
  span: { line: number; column: number },
): SceneItem[] {
  const xlim = numericPair(props.xlim, [0, 10]);
  const ylim = numericPair(props.ylim, [0, 100]);
  if (!xlim || !ylim) return [];

  const xTicks = niceTicks(xlim[0], xlim[1]);
  const yTicks = niceTicks(ylim[0], ylim[1]);
  const items: SceneItem[] = [];

  const xSpan = binary("-", xlimHigh(props), xlimLow(props), span);
  const ySpan = binary("-", ylimHigh(props), ylimLow(props), span);
  const xPad = binary("*", xSpan, literal(0.12), span);
  const yPad = binary("*", ySpan, literal(0.08), span);
  const tickLen = binary("*", ySpan, literal(0.02), span);

  const yForXLabel = binary("-", ylimLow(props), yPad, span);
  const xForYLabel = binary("-", xlimLow(props), xPad, span);

  for (let i = 0; i < xTicks.length; i++) {
    const v = xTicks[i]!;
    items.push(
      node(`${frameName}_xtick_${i}`, {
        role: literal("label"),
        frame: literal(frameName),
        x: literal(v),
        y: yForXLabel,
        text: literal(formatTickValue(v)),
        font: literal(8),
        align: literal("center"),
      }),
      node(`${frameName}_xtickMark_${i}`, {
        role: literal("axis"),
        frame: literal(frameName),
        x1: literal(v),
        y1: ylimLow(props),
        x2: literal(v),
        y2: binary("-", ylimLow(props), tickLen, span),
        strokeWidth: literal(1),
      }),
    );
  }

  for (let i = 0; i < yTicks.length; i++) {
    const v = yTicks[i]!;
    items.push(
      node(`${frameName}_ytick_${i}`, {
        role: literal("label"),
        frame: literal(frameName),
        x: xForYLabel,
        y: literal(v),
        text: literal(formatTickValue(v)),
        font: literal(8),
        align: literal("right"),
      }),
      node(`${frameName}_ytickMark_${i}`, {
        role: literal("axis"),
        frame: literal(frameName),
        x1: xlimLow(props),
        y1: literal(v),
        x2: binary("+", xlimLow(props), tickLen, span),
        y2: literal(v),
        strokeWidth: literal(1),
      }),
    );
  }

  return items;
}

function uniqueSeriesKeys(
  artifact: Artifact,
  dataName: string,
  seriesField: string,
): string[] {
  const decl = artifact.data.find((d) => d.name === dataName);
  if (!decl || decl.value.kind !== "array") return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of decl.value.items) {
    if (row.kind !== "object") continue;
    const sv = objectField(row, seriesField);
    const key =
      sv?.kind === "number"
        ? String(sv.value)
        : sv?.kind === "string"
          ? sv.value
          : "default";
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys.sort((a, b) => a.localeCompare(b));
}

function expandSeriesLegend(
  frameName: string,
  artifact: Artifact,
  dataName: string,
  seriesField: string,
  props: Record<string, Expr>,
  span: { line: number; column: number },
): SceneItem[] {
  const keys = uniqueSeriesKeys(artifact, dataName, seriesField);
  if (!keys.length) return [];

  const x0 = pairAt(props.areaX ?? props.x, 0, 72);
  const y1 = pairAt(props.areaY ?? props.y, 1, 400);
  const baseX = x0.kind === "number" ? x0.value + 12 : 84;
  const baseY = y1.kind === "number" ? y1.value - 14 : 386;

  const items: SceneItem[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    const y = baseY - i * 14;
    items.push(
      node(`${frameName}_leg_${i}`, {
        role: literal("legend"),
        x: literal(baseX),
        y: literal(y - 5),
        w: literal(8),
        h: literal(8),
        radius: literal(2),
        fill: {
          kind: "call",
          callee: "palette",
          args: [
            { kind: "string", value: key, span },
            { kind: "string", value: "categorical", span },
          ],
          span,
        },
        styleSkip: literal(true),
      }),
      node(`${frameName}_legLbl_${i}`, {
        role: literal("legend-label"),
        x: literal(baseX + 14),
        y: literal(y),
        text: literal(key),
        font: literal(8),
      }),
    );
  }
  return items;
}

function node(name: string, props: Record<string, Expr>): SceneItem {
  return {
    kind: "node",
    name,
    alias: name,
    props,
    span: { line: 1, column: 1 },
  };
}

function assign(target: string[], value: Expr): Statement {
  return { kind: "assign", target, value, span: { line: 1, column: 1 } };
}
