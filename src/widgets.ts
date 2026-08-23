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
import { domainMap, parseTimeValue, scaleKind, type ScaleKind } from "./space.js";

export type { WidgetExpandContext, WidgetPlugin } from "./plugins/types.js";
export { getWidget, listWidgets, registerWidget, resetWidgetPlugins };

setWidgetBuiltinSeed(() => {
  registerWidget({
    name: "timeline",
    expand: (ctx) => expandTimeline(ctx.artifact, ctx.props),
  });
  for (const name of [
    "chart.scatter",
    "chart.line",
    "chart.bar",
    "chart.heatmap",
    "chart.vector",
    "chart.funnel",
    "chart.box",
    "chart.violin",
  ] as const) {
    registerWidget({
      name,
      expand: (ctx) => expandChart(ctx.artifact, name, ctx.props, ctx.index),
    });
  }
  registerWidget({
    name: "layout.figure",
    expand: (ctx) => expandLayoutFigure(ctx.artifact, ctx.props, ctx.index),
  });
  registerWidget({
    name: "layout.board",
    expand: (ctx) => expandLayoutBoard(ctx.artifact, ctx.props, ctx.index),
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
        : fieldName(props.xField ?? props.x, kind === "chart.funnel" ? "n" : "x");
  const yField =
    props.yField?.kind === "ident"
      ? props.yField.path[0]!
      : props.yField?.kind === "string"
        ? props.yField.value
        : fieldName(props.yField ?? props.y, kind === "chart.funnel" ? "i" : "y");

  // If x/y were used as area pairs for frame, field defaults stay x/y.
  const useAreaPairs = props.areaX !== undefined || props.areaY !== undefined;
  const resolvedXField = useAreaPairs || props.x?.kind === "array" ? fieldName(props.xField, "x") : xField;
  const resolvedYField = useAreaPairs || props.y?.kind === "array" ? fieldName(props.yField, "y") : yField;
  const seriesField = seriesFieldName(props);
  const horizontal = kind === "chart.funnel" || orientIsHorizontal(props);
  const xCatsProp = catsFromExpr(props.xCats ?? props.categories);
  const yCatsProp = catsFromExpr(props.yCats ?? (horizontal ? props.categories : undefined));
  const xLooksTime =
    scaleKindFromExpr(props.xScale) === "time" ||
    fieldLooksTemporal(artifact, dataName, resolvedXField);
  const yLooksTime =
    scaleKindFromExpr(props.yScale) === "time" ||
    fieldLooksTemporal(artifact, dataName, resolvedYField);
  const xLooksBand =
    scaleKindFromExpr(props.xScale) === "band" ||
    xCatsProp.length > 0 ||
    (!horizontal && !xLooksTime && fieldLooksCategorical(artifact, dataName, resolvedXField));
  const yLooksBand =
    scaleKindFromExpr(props.yScale) === "band" ||
    yCatsProp.length > 0 ||
    (horizontal && !yLooksTime && fieldLooksCategorical(artifact, dataName, resolvedYField));
  const xCats = xLooksBand
    ? xCatsProp.length
      ? xCatsProp
      : collectCats(artifact, dataName, resolvedXField)
    : [];
  const yCats = yLooksBand
    ? yCatsProp.length
      ? yCatsProp
      : collectCats(artifact, dataName, resolvedYField)
    : [];
  if (xCats.length) encodeBandField(artifact, dataName, resolvedXField, "__bandX", xCats);
  if (yCats.length) encodeBandField(artifact, dataName, resolvedYField, "__bandY", yCats);
  const timeX = xLooksTime && !xCats.length
    ? encodeTimeField(artifact, dataName, resolvedXField, "__timeX")
    : null;
  const timeY = yLooksTime && !yCats.length
    ? encodeTimeField(artifact, dataName, resolvedYField, "__timeY")
    : null;
  const markXField = xCats.length ? "__bandX" : timeX ? "__timeX" : resolvedXField;
  const markYField = yCats.length ? "__bandY" : timeY ? "__timeY" : resolvedYField;
  const xScaleExpr =
    asScaleLiteral(props.xScale) ??
    (xCats.length ? literal("band") : timeX ? literal("time") : undefined);
  const yScaleExpr =
    asScaleLiteral(props.yScale) ??
    (yCats.length ? literal("band") : timeY ? literal("time") : undefined);
  const autoXlim = xCats.length
    ? literal([-0.5, xCats.length - 0.5])
    : timeX
      ? literal(padTimeDomain(timeX))
      : undefined;
  const autoYlim = yCats.length
    ? literal([-0.5, yCats.length - 0.5])
    : timeY
      ? literal(padTimeDomain(timeY))
      : undefined;
  const xlimExpr = props.xlim ?? autoXlim;
  const ylimExpr = props.ylim ?? autoYlim;
  const legendAt = legendPlacement(props, seriesField);
  const createdFrame = !artifact.frames.some((f) => f.name === frameName);
  const areaXExpr = reserveLegendArea(
    props.areaX ?? (isPair(props.x) ? props.x : undefined) ?? literal([80, 720]),
    legendAt,
    createdFrame && Boolean(seriesField) && !props.areaX && !isPair(props.x),
    "x",
  );
  const areaYExpr = reserveLegendArea(
    props.areaY ?? (isPair(props.y) ? props.y : undefined) ?? literal([60, 400]),
    legendAt,
    createdFrame && Boolean(seriesField) && !props.areaY && !isPair(props.y),
    "y",
  );

  const existingFrame = artifact.frames.find((f) => f.name === frameName);
  if (!existingFrame) {
    artifact.frames.push({
      name: frameName,
      span,
      props: {
        x: areaXExpr,
        y: areaYExpr,
        xlim: xlimExpr ?? literal([0, 10]),
        ylim: ylimExpr ?? literal([0, 100]),
        ...(xScaleExpr ? { xScale: xScaleExpr } : {}),
        ...(yScaleExpr ? { yScale: yScaleExpr } : {}),
        ...(xCats.length ? { xCats: literal(xCats) } : {}),
        ...(yCats.length ? { yCats: literal(yCats) } : {}),
      },
    });
  } else {
    if (xlimExpr) existingFrame.props.xlim = xlimExpr;
    if (ylimExpr) existingFrame.props.ylim = ylimExpr;
    if (xScaleExpr) existingFrame.props.xScale = xScaleExpr;
    if (yScaleExpr) existingFrame.props.yScale = yScaleExpr;
    if (xCats.length) existingFrame.props.xCats = literal(xCats);
    if (yCats.length) existingFrame.props.yCats = literal(yCats);
  }

  const fr = artifact.frames.find((f) => f.name === frameName)!;
  const geom: Record<string, Expr> = {
    ...props,
    areaX: fr.props.x ?? props.areaX,
    areaY: fr.props.y ?? props.areaY,
    xlim: xlimExpr ?? fr.props.xlim ?? literal([0, 10]),
    ylim: ylimExpr ?? fr.props.ylim ?? literal([0, 100]),
    ...(xScaleExpr ? { xScale: xScaleExpr } : {}),
    ...(yScaleExpr ? { yScale: yScaleExpr } : {}),
    ...(xCats.length ? { xCats: literal(xCats) } : {}),
    ...(yCats.length ? { yCats: literal(yCats) } : {}),
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
  const markProps = markSeriesProps(props, seriesField);

  const axisItems: SceneItem[] = [
    node(`${frameName}_plotBg`, {
      role: literal("plot"),
      x: area.x,
      y: area.y,
      w: area.w,
      h: area.h,
      radius: literal(6),
      ...(chartInteractive(props) ? { drag: literal(true), __chartBrush: literal(true) } : {}),
      ...(props.plotFill ? { fill: props.plotFill } : {}),
      ...(props.plotStroke ? { stroke: props.plotStroke } : {}),
      ...(props.plotStrokeWidth ? { strokeWidth: props.plotStrokeWidth } : {}),
      ...(props.plotOpacity ? { opacity: props.plotOpacity } : {}),
    }),
    ...expandGridLines(frameName, geom, span),
    ...expandAxisTicks(frameName, geom, span, artifact),
    ...expandAxisTitles(frameName, geom, span, artifact),
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
    ...(seriesField && legendAt !== "off"
      ? expandSeriesLegend(frameName, artifact, dataName, seriesField, geom, legendAt, span)
      : []),
    ...expandBrackets(props, frameName, geom, xCats, span),
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
  const interactOpacity = markInteractOpacity(
    seriesField,
    markXField,
    markYField,
    frameName,
    resolvedXField,
    span,
  );
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
          x: ident(`row.${markXField}`),
          y: ident(`row.${markYField}`),
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
          ...interactOpacity,
        }),
        ...expandErrorBars(props, frameName, markXField, markYField, span, seriesField),
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
          x: ident(`row.${markXField}`),
          y: ident(`row.${markYField}`),
          r: props.r ?? literal(4),
          ...markProps,
          ...(explicitFill ? { fill: explicitFill } : {}),
          ...(props.markStroke ? { stroke: props.markStroke } : {}),
          ...(props.markStrokeWidth ? { strokeWidth: props.markStrokeWidth } : {}),
          ...(props.hoverFill ? { hoverFill: props.hoverFill } : { hoverFill: literal("#E69F00") }),
          ...interactOpacity,
        }),
        ...expandErrorBars(props, frameName, markXField, markYField, span, seriesField),
      ],
    });
    marks.push(
      ...expandLineSegments(
        artifact,
        dataName,
        markXField,
        markYField,
        frameName,
        explicitStroke ?? explicitFill,
        span,
        seriesField,
      ),
    );
  } else if (kind === "chart.bar" || kind === "chart.funnel") {
    const barW = barWidthData(props);
    const catField = horizontal ? markYField : markXField;
    if (seriesField) {
      applyGroupedBarDodge(artifact, dataName, catField, seriesField, barW);
    }
    const catExpr = seriesField
      ? binary("+", ident(`row.${catField}`), ident("row.__dodge"), span)
      : ident(`row.${catField}`);
    const valueField = horizontal ? markXField : markYField;
    marks.push({
      kind: "for",
      item: "row",
      source: ident(dataName),
      span,
      body: [
        node("bar", {
          role: literal("mark"),
          frame: literal(frameName),
          x: horizontal ? ident(`row.${markXField}`) : catExpr,
          y: horizontal ? catExpr : ident(`row.${markYField}`),
          w: horizontal
            ? ident(`row.${markXField}`)
            : seriesField
              ? ident("row.__barW")
              : props.barWidth ?? literal(barW),
          h: horizontal
            ? seriesField
              ? ident("row.__barW")
              : props.barWidth ?? literal(barW)
            : ident(`row.${valueField}`),
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
          ...(horizontal ? { __chartBarOrient: literal("h") } : {}),
          ...(props.hoverFill ? { hoverFill: props.hoverFill } : { hoverFill: literal("#E69F00") }),
          ...interactOpacity,
        }),
        ...expandErrorBars(props, frameName, markXField, markYField, span, seriesField),
      ],
    });
  } else if (kind === "chart.heatmap") {
    marks.push(...expandHeatCells(props, dataName, frameName, markXField, markYField, span));
    axisItems.push(...expandColorbar(frameName, geom, span));
  } else if (kind === "chart.vector") {
    const uField = fieldName(props.uField ?? props.dx ?? props.ux, "ux");
    const vField = fieldName(props.vField ?? props.dy ?? props.uy, "uy");
    const vScale = props.vScale?.kind === "number" ? props.vScale.value : 1;
    const dx = binary("*", ident(`row.${uField}`), literal(vScale), span);
    const dy = binary("*", ident(`row.${vField}`), literal(vScale), span);
    marks.push({
      kind: "for",
      item: "row",
      source: ident(dataName),
      span,
      body: [
        node("shaft", {
          role: literal("mark-line"),
          frame: literal(frameName),
          x1: ident(`row.${markXField}`),
          y1: ident(`row.${markYField}`),
          x2: binary("+", ident(`row.${markXField}`), dx, span),
          y2: binary("+", ident(`row.${markYField}`), dy, span),
          ...markProps,
          ...(explicitStroke ?? explicitFill ? { stroke: explicitStroke ?? explicitFill! } : {}),
          strokeWidth: props.strokeWidth ?? literal(2.5),
          strokeLinecap: literal("round"),
          ...interactOpacity,
        }),
        node("head", {
          role: literal("mark"),
          frame: literal(frameName),
          x: binary("+", ident(`row.${markXField}`), dx, span),
          y: binary("+", ident(`row.${markYField}`), dy, span),
          r: props.r ?? literal(4),
          ...markProps,
          ...(explicitFill ? { fill: explicitFill } : {}),
          ...(props.hoverFill ? { hoverFill: props.hoverFill } : { hoverFill: literal("#E69F00") }),
          ...interactOpacity,
        }),
      ],
    });
  } else if (kind === "chart.box") {
    marks.push(
        ...expandBoxMarks(
        artifact,
        dataName,
        frameName,
        markXField,
        resolvedYField,
        seriesField,
        span,
      ),
    );
  } else if (kind === "chart.violin") {
    marks.push(
      ...expandViolinMarks(artifact, dataName, frameName, markXField, resolvedYField, geom, span),
    );
  }

  const markLayer: LayerDecl = {
    name: `__${frameName}_marks`,
    span,
    props: {},
    items: marks,
  };

  artifact.scene?.layers.push(axisLayer, markLayer);
  if (chartInteractive(props)) {
    ensureChartInteract(
      artifact,
      kind,
      frameName,
      dataName,
      resolvedXField,
      resolvedYField,
      markXField,
      markYField,
      valueFieldName(props),
      seriesField,
      geom,
      span,
    );
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
  const prefix = stringProp(props, ["prefix"]) ?? "";
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
  const insetL = numProp(props, "insetL", numProp(props, "plotPadL", 68));
  const insetR = numProp(props, "insetR", numProp(props, "plotPadR", 28));
  const insetT = numProp(props, "insetT", numProp(props, "plotPadT", 28));
  const insetB = numProp(props, "insetB", numProp(props, "plotPadB", 48));
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

function expandLayoutBoard(
  artifact: Artifact,
  props: Record<string, Expr>,
  index: number,
): void {
  const span = artifact.span;
  const id = stringProp(props, ["id"]) ?? (index > 1 ? `board${index}` : "board");
  const originX = numProp(props, "x", 0);
  const originY = numProp(props, "y", 0);
  const width = numProp(props, "w", 1280);
  const height = numProp(props, "h", 720);
  const safe = numProp(props, "safe", 64);
  const titleH = numProp(props, "titleH", 72);
  const lowerH = numProp(props, "lowerH", 96);
  const prefix = stringProp(props, ["prefix"]) ?? "";
  const nameOf = (slot: string) => (prefix ? `${prefix}_${slot}` : slot);

  const safeX0 = originX + safe;
  const safeY0 = originY + safe;
  const safeX1 = originX + width - safe;
  const safeY1 = originY + height - safe;
  const titleY1 = safeY0 + titleH;
  const lowerY0 = safeY1 - lowerH;

  const slots: { name: string; x: [number, number]; y: [number, number] }[] = [
    { name: nameOf("safe"), x: [safeX0, safeX1], y: [safeY0, safeY1] },
    { name: nameOf("title"), x: [safeX0, safeX1], y: [safeY0, titleY1] },
    { name: nameOf("body"), x: [safeX0, safeX1], y: [titleY1, lowerY0] },
    { name: nameOf("lower"), x: [safeX0, safeX1], y: [lowerY0, safeY1] },
  ];

  const splits = Math.max(0, Math.floor(numProp(props, "splits", 0) || numProp(props, "bodyCols", 0)));
  if (splits >= 2) {
    const gutter = numProp(props, "splitGutter", 24);
    const bodyW = safeX1 - safeX0;
    const cellW = (bodyW - gutter * (splits - 1)) / splits;
    for (let i = 0; i < splits; i++) {
      const x0 = safeX0 + i * (cellW + gutter);
      const x1 = x0 + cellW;
      const slotName =
        splits === 2 ? nameOf(i === 0 ? "left" : "right") : nameOf(`split${i}`);
      slots.push({ name: slotName, x: [x0, x1], y: [titleY1, lowerY0] });
    }
  }

  const beats = Math.max(0, Math.floor(numProp(props, "beats", 0) || numProp(props, "shots", 0)));
  if (beats >= 2) {
    const gutter = numProp(props, "beatGutter", 16);
    const bodyW = safeX1 - safeX0;
    const cellW = (bodyW - gutter * (beats - 1)) / beats;
    for (let i = 0; i < beats; i++) {
      const x0 = safeX0 + i * (cellW + gutter);
      slots.push({
        name: nameOf(`beat${i}`),
        x: [x0, x0 + cellW],
        y: [titleY1, lowerY0],
      });
    }
  }

  for (const slot of slots) {
    const existing = artifact.frames.find((f) => f.name === slot.name);
    const frameProps = {
      x: literal(slot.x),
      y: literal(slot.y),
      xlim: existing?.props.xlim ?? literal([0, 1]),
      ylim: existing?.props.ylim ?? literal([0, 1]),
    };
    if (existing) existing.props = { ...existing.props, ...frameProps };
    else artifact.frames.push({ name: slot.name, span, props: frameProps });
  }

  if (boolProp(props, "guides", true)) {
    const guideItems: SceneItem[] = [
      node(`${id}_safe`, {
        role: literal("chrome"),
        x: literal(safeX0),
        y: literal(safeY0),
        w: literal(safeX1 - safeX0),
        h: literal(safeY1 - safeY0),
        stroke: literal("#94a3b8"),
        dash: literal("6 6"),
      }),
      node(`${id}_title`, {
        role: literal("label"),
        x: literal(safeX0 + 8),
        y: literal(safeY0 + 22),
        text: literal("title"),
        font: literal(11),
      }),
      node(`${id}_lower`, {
        role: literal("label"),
        x: literal(safeX0 + 8),
        y: literal(lowerY0 + 22),
        text: literal("lower"),
        font: literal(11),
      }),
    ];
    if (beats >= 2) {
      const gutter = numProp(props, "beatGutter", 16);
      const bodyW = safeX1 - safeX0;
      const cellW = (bodyW - gutter * (beats - 1)) / beats;
      for (let i = 0; i < beats; i++) {
        const x0 = safeX0 + i * (cellW + gutter);
        guideItems.push(
          node(`${id}_beat_${i}`, {
            role: literal("label"),
            x: literal(x0 + 8),
            y: literal(titleY1 + 18),
            text: literal(String(i + 1)),
            font: literal(11),
          }),
        );
      }
    }
    artifact.scene?.layers.push({
      name: `__${id}_guides`,
      span,
      props: {},
      items: guideItems,
    });
  }
}

type LegendPlace = "right" | "bottom" | "inside" | "off";

function legendPlacement(props: Record<string, Expr>, seriesField: string | null): LegendPlace {
  if (!seriesField) return "off";
  const v = props.legend;
  if (!v) return "right";
  if (v.kind === "boolean") return v.value ? "right" : "off";
  if (v.kind === "string" || v.kind === "ident") {
    const raw = v.kind === "string" ? v.value : v.path.join(".");
    const s = raw.toLowerCase();
    if (s === "false" || s === "off" || s === "none") return "off";
    if (s === "inside" || s === "in") return "inside";
    if (s === "bottom" || s === "south") return "bottom";
    return "right";
  }
  return "right";
}

function reserveLegendArea(
  area: Expr,
  place: LegendPlace,
  created: boolean,
  axis: "x" | "y",
): Expr {
  if (!created || area.kind !== "array" || area.items.length < 2) return area;
  const a = numericLiteral(area.items[0]);
  const b = numericLiteral(area.items[1]);
  if (a === null || b === null) return area;
  if (axis === "x" && place === "right") return literal([a, Math.max(a + 40, b - 80)]);
  if (axis === "y" && place === "bottom") return literal([a, Math.max(a + 40, b - 36)]);
  return area;
}

function orientIsHorizontal(props: Record<string, Expr>): boolean {
  const raw = props.orient ?? props.orientation;
  if (!raw) return false;
  const s =
    raw.kind === "string" ? raw.value : raw.kind === "ident" ? raw.path.join(".") : "";
  return s === "h" || s === "horizontal";
}

function catsFromExpr(expr: Expr | undefined): string[] {
  if (!expr) return [];
  if (expr.kind === "array") {
    return expr.items
      .map((item) => {
        if (item.kind === "string") return item.value;
        if (item.kind === "ident") return item.path.join(".");
        if (item.kind === "number") return String(item.value);
        return "";
      })
      .filter(Boolean);
  }
  if (expr.kind === "string") {
    return expr.value.split(/[,|]/).map((part) => part.trim()).filter(Boolean);
  }
  return [];
}

function asScaleLiteral(expr: Expr | undefined): Expr | undefined {
  if (!expr) return undefined;
  if (expr.kind === "string") return expr;
  if (expr.kind === "ident") return literal(expr.path.join("."));
  return expr;
}

function scaleKindFromExpr(expr: Expr | undefined): ScaleKind | null {
  if (!expr) return null;
  if (expr.kind === "string") return scaleKind(expr.value);
  if (expr.kind === "ident") return scaleKind(expr.path.join("."));
  return null;
}

function fieldLooksCategorical(artifact: Artifact, dataName: string, field: string): boolean {
  const decl = artifact.data.find((d) => d.name === dataName);
  if (!decl || decl.value.kind !== "array") return false;
  let sawString = false;
  let sawNumber = false;
  for (const row of decl.value.items) {
    if (row.kind !== "object") continue;
    const value = objectField(row, field);
    if (value?.kind === "string") sawString = true;
    if (value?.kind === "number") sawNumber = true;
  }
  return sawString && !sawNumber;
}

function collectCats(artifact: Artifact, dataName: string, field: string): string[] {
  const decl = artifact.data.find((d) => d.name === dataName);
  if (!decl || decl.value.kind !== "array") return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of decl.value.items) {
    if (row.kind !== "object") continue;
    const value = objectField(row, field);
    const key =
      value?.kind === "number" ? String(value.value) : value?.kind === "string" ? value.value : "";
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

function encodeBandField(
  artifact: Artifact,
  dataName: string,
  field: string,
  dest: string,
  cats: string[],
): void {
  const decl = artifact.data.find((d) => d.name === dataName);
  if (!decl || decl.value.kind !== "array") return;
  for (const row of decl.value.items) {
    if (row.kind !== "object") continue;
    const value = objectField(row, field);
    let idx = 0;
    if (value?.kind === "string") {
      idx = Math.max(0, cats.indexOf(value.value));
    } else if (value?.kind === "number") {
      const labeled = cats.indexOf(String(value.value));
      idx = labeled >= 0 ? labeled : value.value;
    }
    setObjectField(row, dest, literal(idx));
  }
}

function fieldLooksTemporal(artifact: Artifact, dataName: string, field: string): boolean {
  const decl = artifact.data.find((d) => d.name === dataName);
  if (!decl || decl.value.kind !== "array") return false;
  let dates = 0;
  let rows = 0;
  for (const row of decl.value.items) {
    if (row.kind !== "object") continue;
    const value = objectField(row, field);
    if (!value) continue;
    rows += 1;
    if (value.kind === "string" && parseTimeValue(value.value) !== null) dates += 1;
  }
  return rows > 0 && dates === rows;
}

function encodeTimeField(
  artifact: Artifact,
  dataName: string,
  field: string,
  dest: string,
): [number, number] | null {
  const decl = artifact.data.find((d) => d.name === dataName);
  if (!decl || decl.value.kind !== "array") return null;
  const nums: number[] = [];
  for (const row of decl.value.items) {
    if (row.kind !== "object") continue;
    const value = objectField(row, field);
    const parsed =
      value?.kind === "number"
        ? value.value
        : value?.kind === "string"
          ? parseTimeValue(value.value)
          : null;
    if (parsed === null) continue;
    setObjectField(row, dest, literal(parsed));
    nums.push(parsed);
  }
  if (!nums.length) return null;
  return [Math.min(...nums), Math.max(...nums)];
}

function padTimeDomain(range: [number, number]): [number, number] {
  const span = range[1] - range[0];
  const pad = span === 0 ? (range[0] > 3000 ? 86_400_000 : 1) : span * 0.06;
  return [range[0] - pad, range[1] + pad];
}

function timeTicks(min: number, max: number): { value: number; label: string }[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max <= 4000 && min >= 1000) {
    return niceTicks(min, max).map((v) => ({ value: v, label: String(Math.round(v)) }));
  }
  const span = Math.max(1, max - min);
  const day = 86_400_000;
  const ticks: { value: number; label: string }[] = [];
  if (span > day * 800) {
    const y0 = new Date(min).getUTCFullYear();
    const y1 = new Date(max).getUTCFullYear();
    for (let y = y0; y <= y1; y++) {
      const v = Date.UTC(y, 0, 1);
      if (v >= min - day && v <= max + day) ticks.push({ value: v, label: String(y) });
      if (ticks.length > 10) break;
    }
    return ticks;
  }
  if (span > day * 45) {
    const start = new Date(min);
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    for (let i = 0; i < 14; i++) {
      const v = Date.UTC(y, m, 1);
      if (v >= min - day && v <= max + day) {
        ticks.push({ value: v, label: `${y}-${String(m + 1).padStart(2, "0")}` });
      }
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return ticks;
  }
  const d0 = Math.floor(min / day);
  const d1 = Math.ceil(max / day);
  const step = Math.max(1, Math.ceil((d1 - d0) / 6));
  for (let d = d0; d <= d1; d += step) {
    const v = d * day;
    const dt = new Date(v);
    ticks.push({
      value: v,
      label: `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`,
    });
  }
  return ticks;
}

function logTicks(min: number, max: number): number[] {
  const lo = Math.max(min, 1e-12);
  const hi = Math.max(max, lo);
  const e0 = Math.ceil(Math.log10(lo) - 1e-9);
  const e1 = Math.floor(Math.log10(hi) + 1e-9);
  const ticks: number[] = [];
  for (let e = e0; e <= e1; e++) {
    const v = 10 ** e;
    if (v >= lo * 0.999 && v <= hi * 1.001) ticks.push(v);
  }
  if (!ticks.length) {
    ticks.push(lo);
    if (hi > lo * 1.01) ticks.push(hi);
  }
  return ticks;
}

function axisTicks(
  props: Record<string, Expr>,
  axis: "x" | "y",
): { value: number; label: string }[] {
  const cats = catsFromExpr(axis === "x" ? props.xCats : props.yCats);
  if (cats.length) return cats.map((label, i) => ({ value: i, label }));
  const lim = axis === "x" ? numericPair(props.xlim, [0, 10]) : numericPair(props.ylim, [0, 100]);
  if (!lim) return [];
  const kind = scaleKindFromExpr(axis === "x" ? props.xScale : props.yScale) ?? "linear";
  if (kind === "log") {
    return logTicks(lim[0], lim[1]).map((v) => ({ value: v, label: formatTickValue(v) }));
  }
  if (kind === "time") return timeTicks(lim[0], lim[1]);
  return niceTicks(lim[0], lim[1]).map((v) => ({ value: v, label: formatTickValue(v) }));
}

function axisTickValues(props: Record<string, Expr>, axis: "x" | "y"): number[] {
  return axisTicks(props, axis).map((tick) => tick.value);
}

function invertSceneXExpr(
  scene: Expr,
  geom: Record<string, Expr>,
  span: { line: number; column: number },
): Expr {
  const x0 = pairAt(geom.areaX ?? geom.x, 0, 72);
  const x1 = pairAt(geom.areaX ?? geom.x, 1, 720);
  const xmin = xlimLow(geom);
  const xmax = xlimHigh(geom);
  const t = binary("/", binary("-", scene, x0, span), binary("-", x1, x0, span), span);
  if (scaleKindFromExpr(geom.xScale) === "log") {
    const lim = numericPair(geom.xlim, [1, 10]) ?? [1, 10];
    const d0 = Math.log(Math.max(lim[0], 1e-12));
    const d1 = Math.log(Math.max(lim[1], 1e-12));
    return callExpr(
      "exp",
      [binary("+", literal(d0), binary("*", t, literal(d1 - d0), span), span)],
      span,
    );
  }
  return binary("+", xmin, binary("*", t, binary("-", xmax, xmin, span), span), span);
}

function invertSceneYExpr(
  scene: Expr,
  geom: Record<string, Expr>,
  span: { line: number; column: number },
): Expr {
  const y0 = pairAt(geom.areaY ?? geom.y, 0, 60);
  const y1 = pairAt(geom.areaY ?? geom.y, 1, 400);
  const ymin = ylimLow(geom);
  const ymax = ylimHigh(geom);
  const t = binary("/", binary("-", y1, scene, span), binary("-", y1, y0, span), span);
  if (scaleKindFromExpr(geom.yScale) === "log") {
    const lim = numericPair(geom.ylim, [1, 100]) ?? [1, 100];
    const d0 = Math.log(Math.max(lim[0], 1e-12));
    const d1 = Math.log(Math.max(lim[1], 1e-12));
    return callExpr(
      "exp",
      [binary("+", literal(d0), binary("*", t, literal(d1 - d0), span), span)],
      span,
    );
  }
  return binary("+", ymin, binary("*", t, binary("-", ymax, ymin, span), span), span);
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
  const yTicks = axisTickValues(props, "y");
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
  const xTicks = axisTickValues(props, "x");
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

function numericLiteral(expr: Expr | undefined): number | null {
  if (!expr) return null;
  if (expr.kind === "number") return expr.value;
  if (expr.kind === "unary" && expr.op === "-") {
    const inner = numericLiteral(expr.expr);
    return inner === null ? null : -inner;
  }
  return null;
}

function numericPair(expr: Expr | undefined, fallback: [number, number]): [number, number] | null {
  if (expr?.kind === "array" && expr.items.length >= 2) {
    const a = numericLiteral(expr.items[0]);
    const b = numericLiteral(expr.items[1]);
    if (a !== null && b !== null) return [a, b];
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

function plotBoxOf(props: Record<string, Expr>): {
  px0: number;
  px1: number;
  py0: number;
  py1: number;
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  xScale: ScaleKind;
  yScale: ScaleKind;
} | null {
  const ax = numericPair(props.areaX ?? props.x, [80, 720]);
  const ay = numericPair(props.areaY ?? props.y, [60, 400]);
  const xl = numericPair(props.xlim, [0, 10]);
  const yl = numericPair(props.ylim, [0, 100]);
  if (!ax || !ay || !xl || !yl) return null;
  return {
    px0: ax[0],
    px1: ax[1],
    py0: ay[0],
    py1: ay[1],
    xmin: xl[0],
    xmax: xl[1],
    ymin: yl[0],
    ymax: yl[1],
    xScale: scaleKindFromExpr(props.xScale) ?? "linear",
    yScale: scaleKindFromExpr(props.yScale) ?? "linear",
  };
}

function sceneUnitOf(artifact: Artifact): string {
  const expr = artifact.scene?.props.unit;
  if (expr?.kind === "ident") return expr.path.join(".");
  if (expr?.kind === "string") return expr.value;
  return "px";
}

function isCompactScene(artifact: Artifact): boolean {
  const unit = sceneUnitOf(artifact);
  if (unit === "mm" || unit === "pt") return true;
  const size = artifact.scene?.props.size;
  const widthExpr = artifact.scene?.props.width;
  const heightExpr = artifact.scene?.props.height;
  const w =
    widthExpr?.kind === "number"
      ? widthExpr.value
      : size?.kind === "array" && size.items[0]?.kind === "number"
        ? size.items[0].value
        : 880;
  const h =
    heightExpr?.kind === "number"
      ? heightExpr.value
      : size?.kind === "array" && size.items[1]?.kind === "number"
        ? size.items[1].value
        : 480;
  return w <= 320 && h <= 240;
}

function isCompactPlot(box: { px0: number; px1: number; py0: number; py1: number }, unit: string): boolean {
  const w = box.px1 - box.px0;
  const h = box.py1 - box.py0;
  if (unit === "mm" || unit === "pt") return w <= 90 || h <= 56;
  return w <= 180 || h <= 140;
}

function expandAxisTicks(
  frameName: string,
  props: Record<string, Expr>,
  span: { line: number; column: number },
  artifact: Artifact,
): SceneItem[] {
  const xlim = numericPair(props.xlim, [0, 10]);
  const ylim = numericPair(props.ylim, [0, 100]);
  if (!xlim || !ylim) return [];

  const xTicks = axisTicks(props, "x");
  const yTicks = axisTicks(props, "y");
  const items: SceneItem[] = [];
  const box = plotBoxOf(props);
  const unit = sceneUnitOf(artifact);
  const compact = box ? isCompactPlot(box, unit) : isCompactScene(artifact);
  const font = compact ? 8 : 11;
  const ySpan = binary("-", ylimHigh(props), ylimLow(props), span);
  const dataTickLen = binary("*", ySpan, literal(0.02), span);
  const sceneTick =
    box == null
      ? 6
      : unit === "mm" || unit === "pt"
        ? Math.min(compact ? 1.3 : 1.8, (box.px1 - box.px0) * 0.02)
        : compact
          ? 4
          : 6;

  for (let i = 0; i < xTicks.length; i++) {
    const tick = xTicks[i]!;
    if (box) {
      const sx = domainMap(tick.value, [box.xmin, box.xmax], [box.px0, box.px1], false, box.xScale);
      const sy = box.py1 + (compact ? 11 : 15);
      items.push(
        node(`${frameName}_xtick_${i}`, {
          role: literal("label"),
          x: literal(sx),
          y: literal(sy),
          text: literal(tick.label),
          font: literal(font),
          align: literal("center"),
          fill: literal("#3d3d3d"),
        }),
        node(`${frameName}_xtickMark_${i}`, {
          role: literal("axis"),
          x1: literal(sx),
          y1: literal(box.py1),
          x2: literal(sx),
          y2: literal(box.py1 + sceneTick),
          strokeWidth: literal(compact ? 0.8 : 1),
        }),
      );
    } else {
      const xSpan = binary("-", xlimHigh(props), xlimLow(props), span);
      const yPad = binary("*", ySpan, literal(0.08), span);
      items.push(
        node(`${frameName}_xtick_${i}`, {
          role: literal("label"),
          frame: literal(frameName),
          x: literal(tick.value),
          y: binary("-", ylimLow(props), yPad, span),
          text: literal(tick.label),
          font: literal(font),
          align: literal("center"),
        }),
        node(`${frameName}_xtickMark_${i}`, {
          role: literal("axis"),
          frame: literal(frameName),
          x1: literal(tick.value),
          y1: ylimLow(props),
          x2: literal(tick.value),
          y2: binary("-", ylimLow(props), dataTickLen, span),
          strokeWidth: literal(1),
        }),
      );
    }
  }

  for (let i = 0; i < yTicks.length; i++) {
    const tick = yTicks[i]!;
    if (box) {
      const sy = domainMap(tick.value, [box.ymin, box.ymax], [box.py0, box.py1], true, box.yScale);
      const sx = Math.max(compact ? 6 : 10, box.px0 - (compact ? 5 : 8));
      items.push(
        node(`${frameName}_ytick_${i}`, {
          role: literal("label"),
          x: literal(sx),
          y: literal(sy),
          text: literal(tick.label),
          font: literal(font),
          align: literal("right"),
          fill: literal("#3d3d3d"),
        }),
        node(`${frameName}_ytickMark_${i}`, {
          role: literal("axis"),
          x1: literal(box.px0),
          y1: literal(sy),
          x2: literal(box.px0 + sceneTick),
          y2: literal(sy),
          strokeWidth: literal(compact ? 0.8 : 1),
        }),
      );
    } else {
      const xSpan = binary("-", xlimHigh(props), xlimLow(props), span);
      const xPad = binary("*", xSpan, literal(0.12), span);
      items.push(
        node(`${frameName}_ytick_${i}`, {
          role: literal("label"),
          frame: literal(frameName),
          x: binary("-", xlimLow(props), xPad, span),
          y: literal(tick.value),
          text: literal(tick.label),
          font: literal(font),
          align: literal("right"),
        }),
        node(`${frameName}_ytickMark_${i}`, {
          role: literal("axis"),
          frame: literal(frameName),
          x1: xlimLow(props),
          y1: literal(tick.value),
          x2: binary("+", xlimLow(props), dataTickLen, span),
          y2: literal(tick.value),
          strokeWidth: literal(1),
        }),
      );
    }
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
  place: LegendPlace,
  span: { line: number; column: number },
): SceneItem[] {
  const keys = uniqueSeriesKeys(artifact, dataName, seriesField);
  if (!keys.length || place === "off") return [];

  const x0 = pairAt(props.areaX ?? props.x, 0, 72);
  const x1 = pairAt(props.areaX ?? props.x, 1, 720);
  const y0 = pairAt(props.areaY ?? props.y, 0, 60);
  const y1 = pairAt(props.areaY ?? props.y, 1, 400);
  const plotX0 = x0.kind === "number" ? x0.value : 72;
  const plotX1 = x1.kind === "number" ? x1.value : 720;
  const plotY0 = y0.kind === "number" ? y0.value : 60;
  const plotY1 = y1.kind === "number" ? y1.value : 400;

  const items: SceneItem[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    let swatchX: number;
    let swatchY: number;
    if (place === "bottom") {
      swatchX = plotX0 + 8 + i * 72;
      swatchY = plotY1 + 32;
    } else if (place === "inside") {
      swatchX = plotX0 + 12;
      swatchY = plotY1 - 14 - i * 14;
    } else {
      swatchX = plotX1 + 10;
      swatchY = plotY0 + 12 + i * 14;
    }
    items.push(
      node(`${frameName}_leg_${i}`, {
        role: literal("legend"),
        x: literal(swatchX),
        y: literal(swatchY - 5),
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
        x: literal(swatchX + 14),
        y: literal(swatchY),
        text: literal(key),
        font: literal(8),
      }),
    );
    if (!artifact.events.some((e) => e.type === "click" && e.target === `${frameName}_leg_${i}`)) {
      artifact.events.push({
        type: "click",
        target: `${frameName}_leg_${i}`,
        body: [assign(["__highlightGrp"], literal(key))],
        span,
      });
    }
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
  artifact: Artifact,
): SceneItem[] {
  const items: SceneItem[] = [];
  const x0 = pairAt(props.areaX ?? props.x, 0, 80);
  const x1 = pairAt(props.areaX ?? props.x, 1, 720);
  const y0 = pairAt(props.areaY ?? props.y, 0, 60);
  const y1 = pairAt(props.areaY ?? props.y, 1, 400);
  const midX = binary("+", x0, binary("*", binary("-", x1, x0, span), literal(0.5), span), span);
  const midY = binary("+", y0, binary("*", binary("-", y1, y0, span), literal(0.5), span), span);
  const box = plotBoxOf(props);
  const compact = box ? isCompactPlot(box, sceneUnitOf(artifact)) : isCompactScene(artifact);
  const font = compact ? 8 : 11;
  const xCap = axisCaption(props, "x");
  const yCap = axisCaption(props, "y");
  if (xCap) {
    items.push(
      node(`${frameName}_xTitle`, {
        role: literal("axis"),
        x: midX,
        y: binary("+", y1, literal(compact ? 22 : 32), span),
        text: literal(xCap),
        font: literal(font),
        align: literal("center"),
        fill: literal("#222222"),
      }),
    );
  }
  if (yCap) {
    const left = x0.kind === "number" ? Math.max(compact ? 8 : 12, x0.value - (compact ? 18 : 36)) : 16;
    items.push(
      node(`${frameName}_yTitle`, {
        role: literal("axis"),
        x: literal(left),
        y: midY,
        text: literal(yCap),
        font: literal(font),
        align: literal("center"),
        rotate: literal(-90),
        fill: literal("#222222"),
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

function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo]! + ((sorted[hi] ?? sorted[lo]!) - sorted[lo]!) * (i - lo);
}

function expandBoxMarks(
  artifact: Artifact,
  dataName: string,
  frameName: string,
  xField: string,
  yField: string,
  seriesField: string | null,
  span: { line: number; column: number },
): SceneItem[] {
  const decl = artifact.data.find((d) => d.name === dataName);
  if (!decl || decl.value.kind !== "array") return [];
  const groups = new Map<string, number[]>();
  for (const row of decl.value.items) {
    if (row.kind !== "object") continue;
    const xf = objectField(row, xField);
    const yv = objectField(row, yField);
    if (yv?.kind !== "number") continue;
    const key =
      xf?.kind === "number" ? String(xf.value) : xf?.kind === "string" ? xf.value : "0";
    const list = groups.get(key) ?? [];
    list.push(yv.value);
    groups.set(key, list);
  }
  const items: SceneItem[] = [];
  let i = 0;
  for (const [key, values] of groups) {
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const med = quantile(sorted, 0.5);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const loFence = q1 - 1.5 * iqr;
    const hiFence = q3 + 1.5 * iqr;
    const inside = sorted.filter((v) => v >= loFence && v <= hiFence);
    const whiskLo = inside[0] ?? q1;
    const whiskHi = inside[inside.length - 1] ?? q3;
    const xNum = Number(key);
    const x = Number.isFinite(xNum) ? xNum : i;
    const fill = seriesField
      ? {
          kind: "call" as const,
          callee: "palette",
          args: [
            { kind: "string" as const, value: key, span },
            { kind: "string" as const, value: "categorical", span },
          ],
          span,
        }
      : undefined;
    items.push(
      node(`boxWhisker_${i}`, {
        role: literal("mark-line"),
        frame: literal(frameName),
        x1: literal(x),
        y1: literal(whiskLo),
        x2: literal(x),
        y2: literal(whiskHi),
        strokeWidth: literal(1.2),
      }),
      node(`box`, {
        role: literal("mark"),
        frame: literal(frameName),
        x: literal(x),
        y: literal(q3),
        q1: literal(q1),
        w: literal(0.45),
        __chartBox: literal(true),
        ...(fill ? { fill } : {}),
        hoverFill: literal("#E69F00"),
      }),
      node(`boxMed_${i}`, {
        role: literal("mark-line"),
        frame: literal(frameName),
        x1: literal(x - 0.22),
        y1: literal(med),
        x2: literal(x + 0.22),
        y2: literal(med),
        strokeWidth: literal(1.6),
      }),
    );
    for (const v of sorted) {
      if (v >= loFence && v <= hiFence) continue;
      items.push(
        node(`boxOut_${i}_${v}`, {
          role: literal("mark"),
          frame: literal(frameName),
          x: literal(x),
          y: literal(v),
          r: literal(2.4),
        }),
      );
    }
    i += 1;
  }
  return items;
}

function expandBrackets(
  props: Record<string, Expr>,
  frameName: string,
  geom: Record<string, Expr>,
  xCats: string[],
  span: { line: number; column: number },
): SceneItem[] {
  const raw = props.brackets ?? props.compare ?? props.significance;
  if (!raw || raw.kind !== "array") return [];
  const ylim = numericPair(geom.ylim, [0, 100]) ?? [0, 100];
  const items: SceneItem[] = [];
  let slot = 0;
  for (const entry of raw.items) {
    let a = "";
    let b = "";
    let label = "*";
    if (entry.kind === "object") {
      const ae = objectField(entry, "a") ?? objectField(entry, "from") ?? objectField(entry, "left");
      const be = objectField(entry, "b") ?? objectField(entry, "to") ?? objectField(entry, "right");
      const le = objectField(entry, "label") ?? objectField(entry, "p") ?? objectField(entry, "text");
      a = ae?.kind === "string" ? ae.value : ae?.kind === "number" ? String(ae.value) : "";
      b = be?.kind === "string" ? be.value : be?.kind === "number" ? String(be.value) : "";
      label =
        le?.kind === "string" ? le.value : le?.kind === "number" ? `p=${le.value}` : "*";
    } else if (entry.kind === "array" && entry.items.length >= 2) {
      const ae = entry.items[0];
      const be = entry.items[1];
      const le = entry.items[2];
      a = ae?.kind === "string" ? ae.value : ae?.kind === "number" ? String(ae.value) : "";
      b = be?.kind === "string" ? be.value : be?.kind === "number" ? String(be.value) : "";
      label = le?.kind === "string" ? le.value : "*";
    }
    if (!a || !b) continue;
    const xa = xCats.length ? xCats.indexOf(a) : Number(a);
    const xb = xCats.length ? xCats.indexOf(b) : Number(b);
    if (!Number.isFinite(xa) || !Number.isFinite(xb) || xa < 0 || xb < 0) continue;
    const y = ylim[1] - (ylim[1] - ylim[0]) * (0.06 + slot * 0.07);
    const tick = (ylim[1] - ylim[0]) * 0.018;
    items.push(
      node(`${frameName}_brk_${slot}`, {
        role: literal("axis"),
        frame: literal(frameName),
        x1: literal(xa),
        y1: literal(y),
        x2: literal(xb),
        y2: literal(y),
        strokeWidth: literal(1),
      }),
      node(`${frameName}_brkL_${slot}`, {
        role: literal("axis"),
        frame: literal(frameName),
        x1: literal(xa),
        y1: literal(y),
        x2: literal(xa),
        y2: literal(y - tick),
        strokeWidth: literal(1),
      }),
      node(`${frameName}_brkR_${slot}`, {
        role: literal("axis"),
        frame: literal(frameName),
        x1: literal(xb),
        y1: literal(y),
        x2: literal(xb),
        y2: literal(y - tick),
        strokeWidth: literal(1),
      }),
      node(`${frameName}_brkLbl_${slot}`, {
        role: literal("label"),
        frame: literal(frameName),
        x: literal((xa + xb) / 2),
        y: literal(y + tick * 0.8),
        text: literal(label),
        font: literal(9),
        align: literal("center"),
      }),
    );
    slot += 1;
  }
  return items;
}

function gaussianKDE(values: number[], y0: number, y1: number, n: number): number[] {
  const span = y1 - y0 || 1;
  const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
  const variance =
    values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / Math.max(1, values.length);
  const std = Math.sqrt(variance) || span / 8;
  const h = Math.max(span / 28, 0.85 * std * Math.pow(Math.max(1, values.length), -0.2));
  const dens: number[] = [];
  for (let i = 0; i < n; i++) {
    const y = y0 + (i / Math.max(1, n - 1)) * span;
    let s = 0;
    for (const v of values) {
      const u = (y - v) / h;
      s += Math.exp(-0.5 * u * u);
    }
    dens.push(s);
  }
  if (dens.length) {
    dens[0] = 0;
    dens[dens.length - 1] = 0;
  }
  return dens;
}

function violinPathD(
  cx: number,
  dens: number[],
  y0: number,
  y1: number,
  py0: number,
  py1: number,
  yScale: ScaleKind,
  halfMax: number,
): string {
  const n = dens.length;
  const peak = Math.max(...dens, 1e-9);
  const right: string[] = [];
  const left: string[] = [];
  for (let i = 0; i < n; i++) {
    const yVal = y0 + (i / Math.max(1, n - 1)) * (y1 - y0);
    const sy = domainMap(yVal, [y0, y1], [py0, py1], true, yScale);
    const w = (dens[i]! / peak) * halfMax;
    right.push(`${(cx + w).toFixed(2)},${sy.toFixed(2)}`);
    left.push(`${(cx - w).toFixed(2)},${sy.toFixed(2)}`);
  }
  return `M ${right[0]} L ${right.slice(1).join(" L ")} L ${left
    .slice()
    .reverse()
    .join(" L ")} Z`;
}

function expandViolinMarks(
  artifact: Artifact,
  dataName: string,
  frameName: string,
  xField: string,
  yField: string,
  geom: Record<string, Expr>,
  span: { line: number; column: number },
): SceneItem[] {
  const decl = artifact.data.find((d) => d.name === dataName);
  if (!decl || decl.value.kind !== "array") return [];
  const groups = new Map<string, number[]>();
  for (const row of decl.value.items) {
    if (row.kind !== "object") continue;
    const xf = objectField(row, xField);
    const yv = objectField(row, yField);
    if (yv?.kind !== "number") continue;
    const key =
      xf?.kind === "number" ? String(xf.value) : xf?.kind === "string" ? xf.value : "0";
    const list = groups.get(key) ?? [];
    list.push(yv.value);
    groups.set(key, list);
  }
  const box = plotBoxOf(geom);
  const cats = catsFromExpr(geom.xCats);
  const items: SceneItem[] = [];
  let gi = 0;
  const nGroups = Math.max(1, groups.size);
  for (const [key, values] of groups) {
    const xNum = Number(key);
    const x = Number.isFinite(xNum) ? xNum : gi;
    const label = cats[x] ?? key;
    const fill = {
      kind: "call" as const,
      callee: "palette",
      args: [
        { kind: "string" as const, value: label, span },
        { kind: "string" as const, value: "categorical", span },
      ],
      span,
    };
    if (box) {
      const dataMin = Math.min(...values);
      const dataMax = Math.max(...values);
      const pad = Math.max((dataMax - dataMin) * 0.18, (box.ymax - box.ymin) * 0.04);
      const ymin = Math.max(box.ymin, dataMin - pad);
      const ymax = Math.min(box.ymax, dataMax + pad);
      const dens = gaussianKDE(values, ymin, ymax, 48);
      const cx = domainMap(x, [box.xmin, box.xmax], [box.px0, box.px1], false, box.xScale);
      const halfStep =
        Math.abs(
          domainMap(x + 0.36, [box.xmin, box.xmax], [box.px0, box.px1], false, box.xScale) - cx,
        ) || (box.px1 - box.px0) / (2.4 * nGroups);
      items.push(
        node("violin", {
          role: literal("mark"),
          d: literal(violinPathD(cx, dens, ymin, ymax, box.py0, box.py1, box.yScale, halfStep)),
          fill,
          stroke: literal("#1f2937"),
          strokeWidth: literal(1),
          opacity: literal(0.88),
        }),
      );
    } else {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const bins = 10;
      const spanY = max - min || 1;
      const counts = new Array(bins).fill(0);
      for (const v of values) {
        const i = Math.min(bins - 1, Math.max(0, Math.floor(((v - min) / spanY) * bins)));
        counts[i] += 1;
      }
      const peak = Math.max(...counts, 1);
      for (let i = 0; i < bins; i++) {
        const y0 = min + (i / bins) * spanY;
        const y1 = min + ((i + 1) / bins) * spanY;
        const half = 0.38 * (counts[i]! / peak);
        items.push(
          node("violin", {
            role: literal("mark-line"),
            frame: literal(frameName),
            x1: literal(x - half),
            y1: literal((y0 + y1) / 2),
            x2: literal(x + half),
            y2: literal((y0 + y1) / 2),
            strokeWidth: literal(Math.max(2, ((y1 - y0) / spanY) * 28)),
          }),
        );
      }
    }
    const med = quantile([...values].sort((a, b) => a - b), 0.5);
    items.push(
      node(`violinMed_${gi}`, {
        role: literal("mark-line"),
        frame: literal(frameName),
        x1: literal(x - 0.16),
        y1: literal(med),
        x2: literal(x + 0.16),
        y2: literal(med),
        strokeWidth: literal(2),
      }),
    );
    gi += 1;
  }
  return items;
}

function noneExpr(span: { line: number; column: number }): Expr {
  return { kind: "none", span };
}

function objectExpr(
  entries: { key: string; value: Expr }[],
  span: { line: number; column: number },
): Expr {
  return { kind: "object", entries, span };
}

function highlightOpacity(
  seriesField: string | null,
  span: { line: number; column: number },
): Record<string, Expr> {
  return markInteractOpacity(seriesField, null, null, "", null, span);
}

function markInteractOpacity(
  seriesField: string | null,
  xField: string | null,
  yField: string | null,
  frameName: string,
  linkXField: string | null,
  span: { line: number; column: number },
): Record<string, Expr> {
  const parts: Expr[] = [];
  if (seriesField) {
    parts.push(
      binary(
        "and",
        binary("!=", ident("__highlightGrp"), noneExpr(span), span),
        binary("!=", ident(`row.${seriesField}`), ident("__highlightGrp"), span),
        span,
      ),
    );
  }
  if (xField && yField) {
    const loX = callExpr("min", [ident("__brush.dx0"), ident("__brush.dx1")], span);
    const hiX = callExpr("max", [ident("__brush.dx0"), ident("__brush.dx1")], span);
    const loY = callExpr("min", [ident("__brush.dy0"), ident("__brush.dy1")], span);
    const hiY = callExpr("max", [ident("__brush.dy0"), ident("__brush.dy1")], span);
    const outX = binary(
      "or",
      binary("<", ident(`row.${xField}`), loX, span),
      binary(">", ident(`row.${xField}`), hiX, span),
      span,
    );
    const outY = binary(
      "or",
      binary("<", ident(`row.${yField}`), loY, span),
      binary(">", ident(`row.${yField}`), hiY, span),
      span,
    );
    const local = binary("==", ident("__brush.frame"), literal(frameName), span);
    parts.push(
      binary("and", ident("__brush.on"), binary("and", local, binary("or", outX, outY, span), span), span),
    );
    if (linkXField) {
      const linked = binary(
        "and",
        binary("!=", ident("__brush.frame"), literal(frameName), span),
        binary("==", ident("__brush.xField"), literal(linkXField), span),
        span,
      );
      parts.push(binary("and", ident("__brush.on"), binary("and", linked, outX, span), span));
    }
    const inSelX = callExpr("has", [ident("__sel.keys"), ident(`row.${xField}`)], span);
    const inSelG = seriesField
      ? callExpr("has", [ident("__sel.keys"), ident(`row.${seriesField}`)], span)
      : literal(0);
    const inSel = binary("or", inSelX, inSelG, span);
    const otherFrame = binary("!=", ident("__brush.frame"), literal(frameName), span);
    const notInSel: Expr = { kind: "unary", op: "not", expr: inSel, span };
    parts.push(
      binary("and", ident("__sel.n"), binary("and", otherFrame, notInSel, span), span),
    );
  }
  if (!parts.length) return {};
  const dim = parts.reduce((acc, part) => binary("or", acc, part, span));
  return {
    opacity: binary("-", literal(1), binary("*", literal(0.72), dim, span), span),
  };
}

function callExpr(callee: string, args: Expr[], span: { line: number; column: number }): Expr {
  return { kind: "call", callee, args, span };
}

function ensureChartInteract(
  artifact: Artifact,
  kind: string,
  frameName: string,
  dataName: string,
  xField: string,
  yField: string,
  markXField: string,
  markYField: string,
  vField: string,
  seriesField: string | null,
  geom: Record<string, Expr>,
  span: { line: number; column: number },
): void {
  if (!artifact.states.some((s) => s.name === "__tip")) {
    artifact.states.push({ name: "__tip", value: literal(""), span });
  }
  if (!artifact.states.some((s) => s.name === "__hover")) {
    artifact.states.push({
      name: "__hover",
      value: objectExpr(
        [
          { key: "x", value: noneExpr(span) },
          { key: "y", value: noneExpr(span) },
          { key: "v", value: noneExpr(span) },
          { key: "grp", value: noneExpr(span) },
        ],
        span,
      ),
      span,
    });
  }
  if (!artifact.states.some((s) => s.name === "__highlightGrp")) {
    artifact.states.push({ name: "__highlightGrp", value: noneExpr(span), span });
  }
  if (!artifact.states.some((s) => s.name === "__sel")) {
    artifact.states.push({
      name: "__sel",
      value: objectExpr(
        [
          { key: "keys", value: { kind: "array", items: [], span } },
          { key: "n", value: literal(0) },
          { key: "xField", value: literal("") },
        ],
        span,
      ),
      span,
    });
  }
  if (!artifact.states.some((s) => s.name === "__brush")) {
    artifact.states.push({
      name: "__brush",
      value: objectExpr(
        [
          { key: "x0", value: literal(0) },
          { key: "y0", value: literal(0) },
          { key: "x1", value: literal(0) },
          { key: "y1", value: literal(0) },
          { key: "dx0", value: literal(0) },
          { key: "dy0", value: literal(0) },
          { key: "dx1", value: literal(0) },
          { key: "dy1", value: literal(0) },
          { key: "on", value: literal(0) },
          { key: "frame", value: literal("") },
          { key: "xField", value: literal("") },
        ],
        span,
      ),
      span,
    });
  }
  if (!artifact.scene) return;
  const hasHud = artifact.scene.layers.some((l) => l.name === "__chart_hud");
  if (!hasHud) {
    const size = artifact.scene.props.size;
    const width = size?.kind === "array" && size.items[0]?.kind === "number" ? size.items[0].value : 880;
    const height = size?.kind === "array" && size.items[1]?.kind === "number" ? size.items[1].value : 480;
    const compact = isCompactScene(artifact);
    const hudItems: SceneItem[] = [];
    if (!compact) {
      hudItems.push(
        node("chartTip", {
          role: literal("caption"),
          x: literal(Math.max(16, width - 220)),
          y: literal(Math.max(16, height - 16)),
          text: ident("__tip"),
          font: literal(11),
          align: literal("right"),
        }),
      );
    }
    hudItems.push(
        node("brushRect", {
          role: literal("chrome"),
          x: callExpr("min", [ident("__brush.x0"), ident("__brush.x1")], span),
          y: callExpr("min", [ident("__brush.y0"), ident("__brush.y1")], span),
          w: callExpr(
            "abs",
            [binary("-", ident("__brush.x1"), ident("__brush.x0"), span)],
            span,
          ),
          h: callExpr(
            "abs",
            [binary("-", ident("__brush.y1"), ident("__brush.y0"), span)],
            span,
          ),
          fill: literal("#0072B2"),
          opacity: binary("*", ident("__brush.on"), literal(0.18), span),
        }),
    );
    artifact.scene.layers.push({
      name: "__chart_hud",
      span,
      props: {},
      items: hudItems,
    });
  }

  const target =
    kind === "chart.bar" || kind === "chart.funnel"
      ? "bar"
      : kind === "chart.box"
        ? "box"
      : kind === "chart.violin"
        ? "violin"
      : kind === "chart.heatmap"
        ? "heatCell"
        : kind === "chart.line"
          ? "linePt"
          : kind === "chart.vector"
            ? "head"
            : "mark";
  void markXField;
  void markYField;
  if (!artifact.events.some((e) => e.type === "hover" && e.target === target)) {
    const tipExpr =
      kind === "chart.heatmap"
        ? binary(
            "+",
            binary("+", ident(xField), literal(", "), span),
            binary("+", ident(yField), binary("+", literal(" · "), ident(vField), span), span),
            span,
          )
        : binary("+", binary("+", ident(xField), literal(", "), span), ident(yField), span);
    const hoverObj = objectExpr(
      [
        { key: "x", value: ident(xField) },
        { key: "y", value: ident(yField) },
        { key: "v", value: ident(vField) },
        { key: "grp", value: seriesField ? ident(seriesField) : noneExpr(span) },
      ],
      span,
    );
    artifact.events.push({
      type: "hover",
      target,
      body: [
        assign(["__tip"], tipExpr),
        assign(["__hover"], hoverObj),
        ...(seriesField ? [assign(["__highlightGrp"], ident(seriesField))] : []),
      ],
      span,
    });
  }

  const plotName = `${frameName}_plotBg`;
  if (!artifact.events.some((e) => e.type === "dragstart" && e.target === plotName)) {
    const invertX = invertSceneXExpr(ident("__event.x"), geom, span);
    const invertY = invertSceneYExpr(ident("__event.y"), geom, span);
    artifact.events.push({
      type: "dragstart",
      target: plotName,
      body: [
        assign(["__brush", "x0"], ident("__event.x")),
        assign(["__brush", "y0"], ident("__event.y")),
        assign(["__brush", "x1"], ident("__event.x")),
        assign(["__brush", "y1"], ident("__event.y")),
        assign(["__brush", "dx0"], invertX),
        assign(["__brush", "dy0"], invertY),
        assign(["__brush", "dx1"], invertX),
        assign(["__brush", "dy1"], invertY),
        assign(["__brush", "on"], literal(1)),
        assign(["__brush", "frame"], literal(frameName)),
        assign(["__brush", "xField"], literal(xField)),
        ...collectSelStmts(dataName, markXField, markYField, seriesField, span),
      ],
      span,
    });
    artifact.events.push({
      type: "drag",
      target: plotName,
      body: [
        assign(["__brush", "x1"], ident("__event.x")),
        assign(["__brush", "y1"], ident("__event.y")),
        assign(["__brush", "dx1"], invertSceneXExpr(ident("__event.x"), geom, span)),
        assign(["__brush", "dy1"], invertSceneYExpr(ident("__event.y"), geom, span)),
        assign(["__brush", "on"], literal(1)),
        assign(["__brush", "frame"], literal(frameName)),
        assign(["__brush", "xField"], literal(xField)),
        ...collectSelStmts(dataName, markXField, markYField, seriesField, span),
      ],
      span,
    });
  }
}

function collectSelStmts(
  dataName: string,
  xField: string,
  yField: string,
  seriesField: string | null,
  span: { line: number; column: number },
): Statement[] {
  const loX = callExpr("min", [ident("__brush.dx0"), ident("__brush.dx1")], span);
  const hiX = callExpr("max", [ident("__brush.dx0"), ident("__brush.dx1")], span);
  const loY = callExpr("min", [ident("__brush.dy0"), ident("__brush.dy1")], span);
  const hiY = callExpr("max", [ident("__brush.dy0"), ident("__brush.dy1")], span);
  const inX = binary(
    "and",
    binary(">=", ident(`row.${xField}`), loX, span),
    binary("<=", ident(`row.${xField}`), hiX, span),
    span,
  );
  const inY = binary(
    "and",
    binary(">=", ident(`row.${yField}`), loY, span),
    binary("<=", ident(`row.${yField}`), hiY, span),
    span,
  );
  const key = seriesField ? ident(`row.${seriesField}`) : ident(`row.${xField}`);
  const plus = binary(
    "+",
    ident("__sel.keys"),
    { kind: "array", items: [key], span },
    span,
  );
  return [
    assign(["__sel", "keys"], { kind: "array", items: [], span }),
    assign(["__sel", "n"], literal(0)),
    assign(["__sel", "xField"], literal(xField)),
    {
      kind: "for",
      item: "row",
      source: ident(dataName),
      body: [
        {
          kind: "if",
          cond: binary("and", inX, inY, span),
          body: [
            assign(["__sel", "keys"], plus),
            assign(["__sel", "n"], binary("+", ident("__sel.n"), literal(1), span)),
          ],
          span,
        },
      ],
      span,
    },
  ];
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
