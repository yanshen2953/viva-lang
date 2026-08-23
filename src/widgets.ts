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
import { VivaError } from "./diagnostics.js";
import {
  ensureBuiltinPlugins,
  getWidget,
  listWidgets,
  registerWidget,
  resetWidgetPlugins,
  setWidgetBuiltinSeed,
} from "./plugins/registry.js";

export type { WidgetExpandContext, WidgetPlugin } from "./plugins/types.js";
export { getWidget, listWidgets, registerWidget, resetWidgetPlugins };

setWidgetBuiltinSeed(() => {
  registerWidget({
    name: "timeline",
    expand: (ctx) => expandTimeline(ctx.artifact, ctx.props),
  });
  for (const name of ["chart.scatter", "chart.line", "chart.bar", "chart.heatmap"] as const) {
    registerWidget({
      name,
      expand: (ctx) => expandChart(ctx.artifact, name, ctx.props, ctx.index),
    });
  }
  registerWidget({
    name: "layout.figure",
    expand: (ctx) => expandLayoutFigure(ctx.artifact, ctx.props, ctx.index),
  });
});

export function expandWidgets(artifact: Artifact): Artifact {
  ensureBuiltinPlugins();
  const next = structuredClone(artifact);
  if (!next.scene) {
    next.scene = { props: {}, layers: [], span: artifact.span };
  }

  const widgets = [...next.widgets];
  const layout = widgets.filter((w) => w.name.startsWith("layout."));
  const rest = widgets.filter((w) => !w.name.startsWith("layout."));

  let chartIndex = 0;
  let layoutIndex = 0;
  for (const widget of [...layout, ...rest]) {
    const plugin = getWidget(widget.name);
    if (!plugin) {
      throw new VivaError([
        {
          message: `unknown widget '${widget.name}'`,
          span: widget.span,
          source: undefined,
          code: "unknown-widget",
          hint: `Registered: ${listWidgets().join(", ") || "(none)"}. Hosts add more with registerWidget().`,
        },
      ]);
    }
    let index = 0;
    if (widget.name.startsWith("chart.")) {
      chartIndex += 1;
      index = chartIndex;
    } else if (widget.name.startsWith("layout.")) {
      layoutIndex += 1;
      index = layoutIndex;
    }
    plugin.expand({
      artifact: next,
      name: widget.name,
      props: widget.props,
      index,
    });
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
  const frameName = panelOrFrameName(props, index);

  const existingFrame = artifact.frames.find((f) => f.name === frameName);
  if (!existingFrame) {
    artifact.frames.push({
      name: frameName,
      span,
      props: {
        x: props.areaX ?? (isPair(props.x) ? props.x : undefined) ?? literal([72, 720]),
        y: props.areaY ?? (isPair(props.y) ? props.y : undefined) ?? literal([60, 400]),
        xlim: props.xlim ?? literal([0, 10]),
        ylim: props.ylim ?? literal([0, 100]),
      },
    });
  } else {
    if (props.xlim) existingFrame.props.xlim = props.xlim;
    if (props.ylim) existingFrame.props.ylim = props.ylim;
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

  const fr = artifact.frames.find((f) => f.name === frameName)!;
  const geom: Record<string, Expr> = {
    ...props,
    areaX: fr.props.x ?? props.areaX,
    areaY: fr.props.y ?? props.areaY,
    xlim: props.xlim ?? fr.props.xlim ?? literal([0, 10]),
    ylim: props.ylim ?? fr.props.ylim ?? literal([0, 100]),
  };

  const boundPanel = Boolean(props.panel || props.frame);
  const title =
    props.title?.kind === "string"
      ? props.title.value
      : boundPanel
        ? ""
        : sentenceTitle(kind.replace("chart.", ""));

  const titleX = pairAt(geom.areaX ?? geom.x, 0, 72);
  const titleYExpr = (() => {
    const top = pairAt(geom.areaY ?? geom.y, 0, 60);
    if (top.kind === "number") return literal(Math.max(24, top.value - 24));
    return literal(36);
  })();

  const area = areaRect(geom, span);
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
    ...expandGridLines(frameName, geom, span),
    ...expandAxisTicks(frameName, geom, span),
    ...expandAxisTitles(frameName, geom, span),
    node(`${frameName}_xAxis`, {
      role: literal("axis"),
      frame: literal(frameName),
      x1: xlimLow(geom),
      y1: ylimLow(geom),
      x2: xlimHigh(geom),
      y2: ylimLow(geom),
      ...(props.axisColor ?? props.axisStroke ? { stroke: props.axisColor ?? props.axisStroke! } : {}),
    }),
    node(`${frameName}_yAxis`, {
      role: literal("axis"),
      frame: literal(frameName),
      x1: xlimLow(geom),
      y1: ylimLow(geom),
      x2: xlimLow(geom),
      y2: ylimHigh(geom),
      ...(props.axisColor ?? props.axisStroke ? { stroke: props.axisColor ?? props.axisStroke! } : {}),
    }),
    ...(title
      ? [
          node(`${frameName}_title`, {
            role: literal("title"),
            x: titleX,
            y: titleYExpr,
            text: literal(title),
          }),
        ]
      : []),
    ...(seriesField && !props.legend?.kind
      ? expandSeriesLegend(frameName, artifact, dataName, seriesField, geom, span)
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
          ...(props.hoverFill ? { hoverFill: props.hoverFill } : { hoverFill: literal("#E69F00") }),
        }),
        ...expandErrorBars(props, frameName, resolvedXField, resolvedYField, span, seriesField),
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
          r: props.r ?? literal(4),
          ...markProps,
          ...(explicitFill ? { fill: explicitFill } : {}),
          ...(props.markStroke ? { stroke: props.markStroke } : {}),
          ...(props.markStrokeWidth ? { strokeWidth: props.markStrokeWidth } : {}),
          ...(props.hoverFill ? { hoverFill: props.hoverFill } : { hoverFill: literal("#E69F00") }),
        }),
        ...expandErrorBars(props, frameName, resolvedXField, resolvedYField, span, seriesField),
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
          ...(props.hoverFill ? { hoverFill: props.hoverFill } : { hoverFill: literal("#E69F00") }),
        }),
        ...expandErrorBars(props, frameName, resolvedXField, resolvedYField, span, seriesField),
      ],
    });
  } else if (kind === "chart.heatmap") {
    marks.push(...expandHeatCells(props, dataName, frameName, resolvedXField, resolvedYField, span));
    axisItems.push(...expandColorbar(frameName, geom, span));
  }

  const markLayer: LayerDecl = {
    name: `__${frameName}_marks`,
    span,
    props: {},
    items: marks,
  };

  artifact.scene?.layers.push(axisLayer, markLayer);
  if (chartInteractive(props)) {
    ensureChartInteract(artifact, kind, resolvedXField, resolvedYField, valueFieldName(props), span);
  }
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
      grows.sort((a, b) => objectNumber(a, xField) - objectNumber(b, xField));
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
  const ordered = [...rows].sort((a, b) => {
    if (a.kind !== "object" || b.kind !== "object") return 0;
    return objectNumber(a, xField) - objectNumber(b, xField);
  });
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i]!;
    const b = ordered[i + 1]!;
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

function isPair(expr: Expr | undefined): expr is Expr {
  return expr?.kind === "array" && expr.items.length >= 2;
}

function panelOrFrameName(props: Record<string, Expr>, index: number): string {
  const raw = props.panel ?? props.frame;
  if (raw?.kind === "ident") return raw.path.join(".");
  if (raw?.kind === "string") return raw.value;
  return `__chart_${index}`;
}

function numProp(props: Record<string, Expr>, name: string, fallback: number): number {
  const expr = props[name];
  if (expr?.kind === "number") return expr.value;
  return fallback;
}

function boolProp(props: Record<string, Expr>, name: string, fallback: boolean): boolean {
  const expr = props[name];
  if (!expr) return fallback;
  if (expr.kind === "boolean") return expr.value;
  if (expr.kind === "string") return expr.value !== "false" && expr.value !== "off";
  if (expr.kind === "number") return expr.value !== 0;
  return fallback;
}

function panelLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function panelNamesFromProps(props: Record<string, Expr>, count: number, index: number): string[] {
  const prefix =
    stringProp(props, ["prefix"]) ?? (index > 1 ? (stringProp(props, ["id"]) ?? `fig${index}`) : "");
  if (props.panels?.kind === "array") {
    return props.panels.items.slice(0, count).map((item, i) => {
      const raw =
        item.kind === "string"
          ? item.value
          : item.kind === "ident"
            ? item.path.join(".")
            : panelLetter(i);
      return prefix ? `${prefix}_${raw}` : raw;
    });
  }
  return Array.from({ length: count }, (_, i) => {
    const letter = panelLetter(i);
    return prefix ? `${prefix}_${letter}` : letter;
  });
}

function expandLayoutFigure(
  artifact: Artifact,
  props: Record<string, Expr>,
  index: number,
): void {
  const span = artifact.span;
  const id = stringProp(props, ["id"]) ?? (index > 1 ? `fig${index}` : "fig");
  const originX = numProp(props, "x", 40);
  const originY = numProp(props, "y", 40);
  const width = numProp(props, "w", 880);
  const height = numProp(props, "h", 620);
  const cols = Math.max(1, Math.floor(numProp(props, "cols", 2)));
  const rows = Math.max(1, Math.floor(numProp(props, "rows", 2)));
  const gutter = numProp(props, "gutter", 28);
  const margin = numProp(props, "margin", 16);
  const insetL = numProp(props, "insetL", numProp(props, "plotPadL", 52));
  const insetR = numProp(props, "insetR", numProp(props, "plotPadR", 20));
  const insetT = numProp(props, "insetT", numProp(props, "plotPadT", 28));
  const insetB = numProp(props, "insetB", numProp(props, "plotPadB", 40));
  const count = cols * rows;
  const names = panelNamesFromProps(props, count, index);
  const innerW = width - margin * 2;
  const innerH = height - margin * 2;
  const cellW = (innerW - gutter * Math.max(0, cols - 1)) / cols;
  const cellH = (innerH - gutter * Math.max(0, rows - 1)) / rows;
  const labels = boolProp(props, "labels", true);
  const labelItems: SceneItem[] = [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellX0 = originX + margin + col * (cellW + gutter);
    const cellY0 = originY + margin + row * (cellH + gutter);
    const plotX0 = cellX0 + insetL;
    const plotY0 = cellY0 + insetT;
    const plotX1 = cellX0 + cellW - insetR;
    const plotY1 = cellY0 + cellH - insetB;
    const existing = artifact.frames.find((f) => f.name === name);
    const frameProps = {
      x: literal([plotX0, plotX1]),
      y: literal([plotY0, plotY1]),
      xlim: existing?.props.xlim ?? literal([0, 10]),
      ylim: existing?.props.ylim ?? literal([0, 100]),
    };
    if (existing) {
      existing.props = { ...existing.props, ...frameProps };
    } else {
      artifact.frames.push({ name, span, props: frameProps });
    }
    if (labels) {
      const raw = name.includes("_") ? name.slice(name.lastIndexOf("_") + 1) : name;
      labelItems.push(
        node(`${id}_lab_${name}`, {
          role: literal("label"),
          x: literal(cellX0 + 6),
          y: literal(cellY0 + 14),
          text: literal(`(${raw})`),
          font: literal(11),
          fontWeight: literal(700),
        }),
      );
    }
  }

  if (labelItems.length) {
    artifact.scene?.layers.push({
      name: `__${id}_labels`,
      span,
      props: {},
      items: labelItems,
    });
  }
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
  if (!Number.isFinite(v)) return "";
  const av = Math.abs(v);
  if (av !== 0 && (av < 0.01 || av >= 10000)) {
    return v.toExponential(1).replace("e+", "e");
  }
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

function sentenceTitle(kind: string): string {
  if (!kind) return "Chart";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function stringProp(props: Record<string, Expr>, keys: string[]): string | null {
  for (const key of keys) {
    const expr = props[key];
    if (expr?.kind === "string" && expr.value) return expr.value;
    if (expr?.kind === "ident" && expr.path.length) return expr.path.join(".");
  }
  return null;
}

function chartInteractive(props: Record<string, Expr>): boolean {
  const v = props.interactive;
  if (!v) return true;
  if (v.kind === "boolean") return v.value;
  if (v.kind === "string") return v.value !== "false" && v.value !== "off";
  return true;
}

function errorFieldName(props: Record<string, Expr>): string | null {
  const expr = props.errorField ?? props.yerr ?? props.yError ?? props.err;
  if (!expr) return null;
  return fieldName(expr, "err");
}

function valueFieldName(props: Record<string, Expr>): string {
  return fieldName(props.valueField ?? props.zField ?? props.vField ?? props.value, "v");
}

function axisCaption(props: Record<string, Expr>, axis: "x" | "y"): string | null {
  const label =
    axis === "x"
      ? stringProp(props, ["xLabel", "xlabel", "xTitle"])
      : stringProp(props, ["yLabel", "ylabel", "yTitle"]);
  const unit =
    axis === "x"
      ? stringProp(props, ["xUnit", "xunit"])
      : stringProp(props, ["yUnit", "yunit"]);
  if (!label && !unit) return null;
  if (label && unit) return `${label} (${unit})`;
  return label ?? unit;
}

function expandAxisTitles(
  frameName: string,
  props: Record<string, Expr>,
  span: { line: number; column: number },
): SceneItem[] {
  const items: SceneItem[] = [];
  const x0 = pairAt(props.areaX ?? props.x, 0, 72);
  const x1 = pairAt(props.areaX ?? props.x, 1, 720);
  const y0 = pairAt(props.areaY ?? props.y, 0, 60);
  const y1 = pairAt(props.areaY ?? props.y, 1, 400);
  const midX = binary("+", x0, binary("*", binary("-", x1, x0, span), literal(0.5), span), span);
  const midY = binary("+", y0, binary("*", binary("-", y1, y0, span), literal(0.5), span), span);
  const xCap = axisCaption(props, "x");
  const yCap = axisCaption(props, "y");
  if (xCap) {
    items.push(
      node(`${frameName}_xTitle`, {
        role: literal("axis"),
        x: midX,
        y: binary("+", y1, literal(28), span),
        text: literal(xCap),
        font: literal(9),
        align: literal("center"),
      }),
    );
  }
  if (yCap) {
    const left = x0.kind === "number" ? Math.max(12, x0.value - 28) : 16;
    items.push(
      node(`${frameName}_yTitle`, {
        role: literal("axis"),
        x: literal(left),
        y: midY,
        text: literal(yCap),
        font: literal(9),
        align: literal("center"),
        rotate: literal(-90),
      }),
    );
  }
  return items;
}

function expandErrorBars(
  props: Record<string, Expr>,
  frameName: string,
  xField: string,
  yField: string,
  span: { line: number; column: number },
  seriesField: string | null,
): SceneItem[] {
  const err = errorFieldName(props);
  if (!err) return [];
  const xExpr = seriesField
    ? binary("+", ident(`row.${xField}`), ident("row.__dodge"), span)
    : ident(`row.${xField}`);
  const yLo = binary("-", ident(`row.${yField}`), ident(`row.${err}`), span);
  const yHi = binary("+", ident(`row.${yField}`), ident(`row.${err}`), span);
  const cap = literal(0.12);
  return [
    node("errStem", {
      role: literal("mark-line"),
      frame: literal(frameName),
      x1: xExpr,
      y1: yLo,
      x2: xExpr,
      y2: yHi,
      strokeWidth: literal(1),
    }),
    node("errCapLo", {
      role: literal("mark-line"),
      frame: literal(frameName),
      x1: binary("-", xExpr, cap, span),
      y1: yLo,
      x2: binary("+", xExpr, cap, span),
      y2: yLo,
      strokeWidth: literal(1),
    }),
    node("errCapHi", {
      role: literal("mark-line"),
      frame: literal(frameName),
      x1: binary("-", xExpr, cap, span),
      y1: yHi,
      x2: binary("+", xExpr, cap, span),
      y2: yHi,
      strokeWidth: literal(1),
    }),
  ];
}

function zlimPair(props: Record<string, Expr>): [number, number] {
  const pair = numericPair(props.zlim ?? props.clim, [0, 1]);
  return pair ?? [0, 1];
}

function expandHeatCells(
  props: Record<string, Expr>,
  dataName: string,
  frameName: string,
  xField: string,
  yField: string,
  span: { line: number; column: number },
): SceneItem[] {
  const vField = valueFieldName(props);
  const [z0, z1] = zlimPair(props);
  const cellW = props.cellW?.kind === "number" ? props.cellW.value : 1;
  const cellH = props.cellH?.kind === "number" ? props.cellH.value : 1;
  const range = binary("-", literal(z1), literal(z0), span);
  const norm = binary(
    "/",
    binary("-", ident(`row.${vField}`), literal(z0), span),
    range,
    span,
  );
  const tier = {
    kind: "call" as const,
    callee: "clamp",
    args: [
      {
        kind: "call" as const,
        callee: "round",
        args: [binary("*", norm, literal(6), span)],
        span,
      },
      literal(0),
      literal(6),
    ],
    span,
  };
  return [
    {
      kind: "for",
      item: "row",
      source: ident(dataName),
      span,
      body: [
        node("heatCell", {
          role: literal("mark-area"),
          frame: literal(frameName),
          x: ident(`row.${xField}`),
          y: ident(`row.${yField}`),
          w: literal(cellW),
          h: literal(cellH),
          fill: {
            kind: "call",
            callee: "palette",
            args: [tier, { kind: "string", value: "sequential", span }],
            span,
          },
          stroke: literal("#ffffff"),
          strokeWidth: literal(0.6),
          __chartHeat: literal(true),
        }),
      ],
    },
  ];
}

function expandColorbar(
  frameName: string,
  props: Record<string, Expr>,
  span: { line: number; column: number },
): SceneItem[] {
  const [z0, z1] = zlimPair(props);
  const x1 = pairAt(props.areaX ?? props.x, 1, 720);
  const y0 = pairAt(props.areaY ?? props.y, 0, 60);
  const y1 = pairAt(props.areaY ?? props.y, 1, 400);
  const barX = x1.kind === "number" ? x1.value + 10 : 730;
  const top = y0.kind === "number" ? y0.value : 60;
  const bot = y1.kind === "number" ? y1.value : 400;
  const h = Math.max(40, bot - top);
  const steps = 7;
  const items: SceneItem[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    items.push(
      node(`${frameName}_cbar_${i}`, {
        role: literal("colorbar"),
        x: literal(barX),
        y: literal(bot - ((i + 1) / steps) * h),
        w: literal(10),
        h: literal(h / steps),
        fill: {
          kind: "call",
          callee: "palette",
          args: [literal(i), { kind: "string", value: "sequential", span }],
          span,
        },
        styleSkip: literal(true),
      }),
    );
    if (i === 0 || i === steps - 1 || i === Math.floor(steps / 2)) {
      const value = z0 + t * (z1 - z0);
      items.push(
        node(`${frameName}_cbarLbl_${i}`, {
          role: literal("tick"),
          x: literal(barX + 14),
          y: literal(bot - t * h + 3),
          text: literal(formatTickValue(value)),
          font: literal(7),
        }),
      );
    }
  }
  return items;
}

function ensureChartInteract(
  artifact: Artifact,
  kind: string,
  xField: string,
  yField: string,
  vField: string,
  span: { line: number; column: number },
): void {
  if (!artifact.states.some((s) => s.name === "__tip")) {
    artifact.states.push({ name: "__tip", value: literal(""), span });
  }
  if (!artifact.scene) return;
  const hasHud = artifact.scene.layers.some((l) => l.name === "__chart_hud");
  if (!hasHud) {
    const size = artifact.scene.props.size;
    const width = size?.kind === "array" && size.items[0]?.kind === "number" ? size.items[0].value : 880;
    const height = size?.kind === "array" && size.items[1]?.kind === "number" ? size.items[1].value : 480;
    artifact.scene.layers.push({
      name: "__chart_hud",
      span,
      props: {},
      items: [
        node("chartTip", {
          role: literal("caption"),
          x: literal(Math.max(16, width - 220)),
          y: literal(Math.max(16, height - 16)),
          text: ident("__tip"),
          font: literal(11),
          align: literal("right"),
        }),
      ],
    });
  }

  const target =
    kind === "chart.bar" ? "bar" : kind === "chart.heatmap" ? "heatCell" : kind === "chart.line" ? "linePt" : "mark";
  if (artifact.events.some((e) => e.type === "hover" && e.target === target)) return;

  const tipExpr =
    kind === "chart.heatmap"
      ? binary(
          "+",
          binary("+", ident(xField), literal(", "), span),
          binary("+", ident(yField), binary("+", literal(" · "), ident(vField), span), span),
          span,
        )
      : binary("+", binary("+", ident(xField), literal(", "), span), ident(yField), span);

  artifact.events.push({
    type: "hover",
    target,
    body: [assign(["__tip"], tipExpr)],
    span,
  });
}

function objectNumber(obj: Extract<Expr, { kind: "object" }>, key: string): number {
  const v = objectField(obj, key);
  return v?.kind === "number" ? v.value : 0;
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
