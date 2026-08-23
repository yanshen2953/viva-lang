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
import { COLUMN_MM, mmToPx, pageColumnMeasure, parsePage, sceneScaleOf } from "./space/scene-box.js";
import { estimateBoardBands, measureChipWidth } from "./layout/board-chrome.js";
import { figureCopyDefaults, figureCopyPlace, figureGapDefaults } from "./layout/figure-gap.js";
import { packCopyLinesToColumns, packCopyLinesToPages, readableTypeColCount } from "./layout/copy-flow.js";
import { figurePageReserves, packFigureCellsToPages } from "./layout/figure-page.js";
import {
  chartHostBox,
  fillAuthorSlotNodes,
  PLOT_SLOT_INSET,
  promotePanelFrames,
  slotHasAuthorPlot,
} from "./layout/chart-fit.js";
import { boxStats, quantile } from "./layout/summary-stats.js";
import { gaussianKDE, violinPathD } from "./layout/violin-density.js";
import {
  clampChartInsets,
  growInsetsForChrome,
  growInsetsForNeighbors,
  ellipsizeToWidth,
  wrapTextLines,
  INSET_CAP_FIT,
  INSET_CAP_SOFT,
  placePaperChrome,
  thinXTicks,
  thinYTicks,
  type ChromeRect,
  type NeighborChrome,
  type PaperChrome,
} from "./layout/chrome-collide.js";

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

  promotePanelFrames(next);
  implicitFigureIfNeeded(next);
  const widgets = [...next.widgets];
  const layoutRank = (name: string) => {
    if (name === "layout.board") return 0;
    if (name === "layout.figure") return 1;
    return 2;
  };
  const layout = widgets
    .filter((w) => w.name.startsWith("layout."))
    .sort((a, b) => layoutRank(a.name) - layoutRank(b.name));
  const rest = widgets.filter((w) => !w.name.startsWith("layout."));

  let chartIndex = 0;
  let figureIndex = 0;
  let boardIndex = 0;
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
    } else if (widget.name === "layout.figure") {
      figureIndex += 1;
      index = figureIndex;
    } else if (widget.name === "layout.board") {
      boardIndex += 1;
      index = boardIndex;
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
  liftFramedWorldLayers(next);
  liftPlayLayers(next);
  paintPageFolio(next);
  fillAuthorSlotNodes(next);
  promotePanelFrames(next);
  fillAuthorSlotNodes(next);
  bindFramedWorldInteract(next);
  paintPlotFrameChrome(next);
  return next;
}

/**
 * Folio n/N plus a later-slice running head. Figure titles keep
 * `(continued)`; board titles repeat as-is. Same caption primitive.
 * Odd slices (recto) put folio and the head on the right; even
 * slices (verso) put them on the left. One page, or no `page` prop,
 * paints nothing. Not a section-mark typesetter — no jump folio.
 */
function paintPageFolio(artifact: Artifact): void {
  const scene = artifact.scene;
  if (!scene) return;
  const page = parsePage(stringProp(scene.props, ["page"]));
  if (!page) return;
  const unit = sceneUnitOf(artifact);
  const extent = sceneExtentOf(artifact);
  const pageH = unit === "mm" || unit === "pt" ? page.h : mmToPx(page.h);
  if (!(pageH > 0)) return;
  const pages = Math.max(1, Math.ceil(extent.h / pageH - 1e-6));
  if (pages < 2) return;

  const figure = artifact.widgets.find((w) => w.name === "layout.figure");
  const board = artifact.widgets.find((w) => w.name === "layout.board");
  const figureTitle = figure ? stringProp(figure.props, ["title"]) : null;
  const boardTitle = board ? stringProp(board.props, ["title"]) : null;
  const title = figureTitle ?? boardTitle;
  const markContinued = Boolean(figureTitle);
  const { pad } = figurePageReserves(unit);
  const scale = sceneScaleOf({ unit });
  const wrapW = Math.max(40, (extent.w - pad * 2) * Math.max(scale, 1e-6));
  const items: SceneItem[] = [];
  for (let i = 0; i < pages; i++) {
    const n = i + 1;
    const verso = n % 2 === 0;
    const top = i * pageH;
    const bottom = Math.min((i + 1) * pageH, extent.h);
    const outerX = verso ? pad : extent.w - pad;
    const outerAlign = verso ? "start" : "right";
    items.push(
      node(`__page_folio_${n}`, {
        role: literal("caption"),
        text: literal(`${n} / ${pages}`),
        x: literal(outerX),
        y: literal(bottom - pad * 0.85),
        align: literal(outerAlign),
      }),
    );
    if (i > 0 && title) {
      const raw = markContinued ? `${title} (continued)` : title;
      items.push(
        node(`__page_folio_title_${n}`, {
          role: literal("caption"),
          text: literal(ellipsizeToWidth(raw, wrapW, 8, 0.1)),
          x: literal(outerX),
          y: literal(top + pad * 1.2),
          w: literal(Math.max(8, extent.w - pad * 2)),
          align: literal(outerAlign),
        }),
      );
    }
  }
  scene.layers.push({
    name: "__page_folio",
    span: artifact.span,
    props: {},
    items,
  });
}

function isUnboundChart(widget: Artifact["widgets"][number]): boolean {
  if (!widget.name.startsWith("chart.")) return false;
  if (widget.props.panel || widget.props.frame) return false;
  if (widget.props.areaX || widget.props.areaY || isPair(widget.props.x) || isPair(widget.props.y)) {
    return false;
  }
  return true;
}

/** Two or more charts with no panel/area become a figure grid. No new keyword. */
function implicitFigureIfNeeded(artifact: Artifact): void {
  if (artifact.widgets.some((w) => w.name.startsWith("layout."))) return;
  const unbound = artifact.widgets.filter(isUnboundChart);
  if (unbound.length < 2) return;
  const n = unbound.length;
  const cols = n <= 3 ? n : Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  for (let i = 0; i < n; i++) {
    unbound[i]!.props.panel = literal(panelLetter(i));
  }
  const extent = sceneExtentOf(artifact);
  const unit = sceneUnitOf(artifact);
  const host = chartHostBox(artifact, extent, unit);
  expandLayoutFigure(
    artifact,
    {
      id: literal("auto"),
      x: literal(host.x),
      y: literal(host.y),
      w: literal(host.w),
      h: literal(host.h),
      cols: literal(cols),
      rows: literal(rows),
      labels: literal(true),
    },
    1,
  );
}

/** Author plot/mark layers must paint after figure decks, not under them. */
function liftFramedWorldLayers(artifact: Artifact): void {
  const layers = artifact.scene?.layers;
  if (!layers?.length) return;
  const world: LayerDecl[] = [];
  const rest: LayerDecl[] = [];
  for (const layer of layers) {
    if (layerHasFramedWorld(layer)) world.push(layer);
    else rest.push(layer);
  }
  if (!world.length) return;
  let insertAt = -1;
  for (let i = 0; i < rest.length; i++) {
    const name = rest[i]!.name;
    if (name.startsWith("__") && (name.includes("_decks") || name.includes("_plate"))) {
      insertAt = i;
    }
  }
  if (insertAt < 0) return;
  rest.splice(insertAt + 1, 0, ...world);
  artifact.scene!.layers = rest;
}

function layerHasFramedWorld(layer: LayerDecl): boolean {
  if (layer.name.startsWith("__")) return false;
  return sceneItemsAreFramedWorld(layer.items);
}

function sceneItemsAreFramedWorld(items: SceneItem[]): boolean {
  for (const item of items) {
    if (item.kind === "for" || item.kind === "if") {
      if (sceneItemsAreFramedWorld(item.body)) return true;
      continue;
    }
    if (item.kind !== "node") continue;
    const role = stringProp(item.props, ["role"]) ?? "";
    if (role === "plot") return true;
    if (stringProp(item.props, ["frame"])) return true;
  }
  return false;
}

/** `layout.board play` veils must paint after chart marks (layout expands first). */
function liftPlayLayers(artifact: Artifact): void {
  const layers = artifact.scene?.layers;
  if (!layers?.length) return;
  const play = layers.filter((layer) => /_play$/.test(layer.name));
  if (!play.length) return;
  artifact.scene!.layers = [...layers.filter((layer) => !/_play$/.test(layer.name)), ...play];
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
    ((horizontal || kind === "chart.heatmap") &&
      !yLooksTime &&
      fieldLooksCategorical(artifact, dataName, resolvedYField));
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
  const hasAreaX = Boolean(props.areaX || isPair(props.x));
  const hasAreaY = Boolean(props.areaY || isPair(props.y));
  const boundPanel = Boolean(props.panel || props.frame);
  const extent = sceneExtentOf(artifact);
  const host =
    !boundPanel && createdFrame && !hasAreaX && !hasAreaY
      ? chartHostBox(artifact, extent, sceneUnitOf(artifact))
      : { x: 0, y: 0, w: extent.w, h: extent.h };
  const areaXExpr = (() => {
    if (!boundPanel && createdFrame && !hasAreaX) {
      const inset = fitChartInsets(
        artifact,
        { name: kind, props },
        host.x,
        host.y,
        host.w,
        host.h,
      );
      return literal([
        host.x + inset.l,
        Math.max(host.x + inset.l + 8, host.x + host.w - inset.r),
      ]);
    }
    return reserveLegendArea(
      props.areaX ?? (isPair(props.x) ? props.x : undefined) ?? literal([80, 720]),
      legendAt,
      createdFrame && Boolean(seriesField) && !hasAreaX,
      "x",
    );
  })();
  const areaYExpr = (() => {
    if (!boundPanel && createdFrame && !hasAreaY) {
      const inset = fitChartInsets(
        artifact,
        { name: kind, props },
        host.x,
        host.y,
        host.w,
        host.h,
      );
      return literal([
        host.y + inset.t,
        Math.max(host.y + inset.t + 8, host.y + host.h - inset.b),
      ]);
    }
    return reserveLegendArea(
      props.areaY ?? (isPair(props.y) ? props.y : undefined) ?? literal([60, 400]),
      legendAt,
      createdFrame && Boolean(seriesField) && !hasAreaY,
      "y",
    );
  })();

  const existingFrame = artifact.frames.find((f) => f.name === frameName);
  if (!existingFrame) {
    artifact.frames.push({
      name: frameName,
      span,
      props: {
        x: areaXExpr,
        y: areaYExpr,
        ...(!boundPanel && createdFrame
          ? {
              cellX: literal([host.x, host.x + host.w]),
              cellY: literal([host.y, host.y + host.h]),
            }
          : {}),
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
    ...(fr.props.cellX ? { cellX: fr.props.cellX } : {}),
    ...(fr.props.cellY ? { cellY: fr.props.cellY } : {}),
    xlim: xlimExpr ?? fr.props.xlim ?? literal([0, 10]),
    ylim: ylimExpr ?? fr.props.ylim ?? literal([0, 100]),
    ...(xScaleExpr ? { xScale: xScaleExpr } : {}),
    ...(yScaleExpr ? { yScale: yScaleExpr } : {}),
    ...(xCats.length ? { xCats: literal(xCats) } : {}),
    ...(yCats.length ? { yCats: literal(yCats) } : {}),
  };

  const title =
    props.title?.kind === "string"
      ? props.title.value
      : boundPanel
        ? ""
        : sentenceTitle(kind.replace("chart.", ""));

  const legendKeys = seriesField ? uniqueSeriesKeys(artifact, dataName, seriesField) : [];
  const chrome = paperChromeOf(geom, artifact, {
    colorbar: kind === "chart.heatmap",
    legendAt: seriesField && legendAt !== "off" ? legendAt : undefined,
    legendKeys,
    title,
  });
  const titleX = chrome ? literal(chrome.titleX) : pairAt(geom.areaX ?? geom.x, 0, 72);
  const titleYExpr = chrome
    ? literal(chrome.titleY)
    : (() => {
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
    ...expandAxisTicks(frameName, geom, span, artifact, chrome),
    ...expandAxisTitles(frameName, geom, span, artifact, chrome),
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
      ? (chrome?.titleLines?.length ? chrome.titleLines : [title]).map((line, i) =>
          node(`${frameName}_title${i ? `_${i}` : ""}`, {
            role: literal("title"),
            x: titleX,
            y: chrome ? literal(chrome.titleY + i * chrome.titleLineH) : titleYExpr,
            text: literal(line),
          }),
        )
      : []),
    ...(seriesField && legendAt !== "off"
      ? expandSeriesLegend(frameName, artifact, dataName, seriesField, geom, legendAt, span, chrome)
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
  const linkMode = selLinkMode(props);
  const interactOpacity = markInteractOpacity(
    seriesField,
    markXField,
    markYField,
    frameName,
    resolvedXField,
    span,
    linkMode === "dim",
  );
  const interactVisible = linkMode === "filter" ? markSelVisible(seriesField, markXField, frameName, span) : {};
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
          ...interactVisible,
          ...markHighlightMotion(props, seriesField, span),
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
          ...interactVisible,
          ...markHighlightMotion(props, seriesField, span),
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
          ...interactVisible,
          ...markHighlightMotion(props, seriesField, span),
          __barData: literal(dataName),
          __barCatField: literal(catField),
          __barValueField: literal(valueField),
          __barKey: ident(`row.${catField}`),
          ...(seriesField
            ? { __barSeriesField: literal(seriesField), __barSeriesKey: ident(`row.${seriesField}`) }
            : {}),
          ...(horizontal ? { __barOrient: literal("h") } : { __barOrient: literal("v") }),
        }),
        ...expandErrorBars(props, frameName, markXField, markYField, span, seriesField),
      ],
    });
  } else if (kind === "chart.heatmap") {
    marks.push(
      ...expandHeatCells(artifact, props, dataName, frameName, markXField, markYField, span, {
        ...interactOpacity,
        ...interactVisible,
      }),
    );
    axisItems.push(...expandColorbar(frameName, geom, span, chrome));
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
          ...interactVisible,
          __vecData: literal(dataName),
          __vecXField: literal(markXField),
          __vecYField: literal(markYField),
          __vecUField: literal(uField),
          __vecVField: literal(vField),
          __vecScale: literal(vScale),
          __vecXVal: ident(`row.${markXField}`),
          __vecYVal: ident(`row.${markYField}`),
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
          ...interactVisible,
          ...markHighlightMotion(props, seriesField, span),
          __vecData: literal(dataName),
          __vecXField: literal(markXField),
          __vecYField: literal(markYField),
          __vecUField: literal(uField),
          __vecVField: literal(vField),
          __vecScale: literal(vScale),
          __vecXVal: ident(`row.${markXField}`),
          __vecYVal: ident(`row.${markYField}`),
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
        resolvedXField,
        resolvedYField,
        seriesField,
        geom,
        span,
      ),
    );
  } else if (kind === "chart.violin") {
    marks.push(
      ...expandViolinMarks(
        artifact,
        dataName,
        frameName,
        markXField,
        resolvedXField,
        resolvedYField,
        geom,
        span,
      ),
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
    const allKeys = [...groups.keys()];
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
            ...markSelKeysVisible([gkey], frameName, span),
            __lineData: literal(dataName),
            __lineKey: literal(gkey),
            __lineSeries: literal(seriesField),
            __lineXPos: literal(xField),
            __lineYField: literal(yField),
            __lineCats: literal(allKeys),
            __lineIndex: literal(i),
            __lineFrame: literal(frameName),
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
        __lineData: literal(dataName),
        __lineKey: literal(""),
        __lineSeries: literal(""),
        __lineXPos: literal(xField),
        __lineYField: literal(yField),
        __lineCats: literal([]),
        __lineIndex: literal(i),
        __lineFrame: literal(frameName),
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
  const box = resolveLayoutBox(artifact, props);
  const originX = box.x;
  const originY = box.y;
  const width = box.w;
  let height = box.h;
  const titleExpr = copyExpr(props, ["title"]);
  const subtitleExpr = copyExpr(props, ["subtitle"]);
  const captionExpr = copyExpr(props, ["caption"]);
  const boundSlot = Boolean(stringProp(props, ["panel", "frame"]));
  const plate = boolProp(
    props,
    "plate",
    Boolean(titleExpr || subtitleExpr || captionExpr || boundSlot),
  );
  const copyBands = figureCopyDefaults({
    unit: sceneUnitOf(artifact),
    hasTitle: Boolean(titleExpr),
    hasSubtitle: Boolean(subtitleExpr),
    hasCaption: Boolean(captionExpr),
  });
  const titleH = titleExpr
    ? props.titleH !== undefined
      ? numProp(props, "titleH", copyBands.titleH)
      : copyBands.titleH
    : 0;
  const capH = captionExpr
    ? props.captionH !== undefined
      ? numProp(props, "captionH", copyBands.capH)
      : copyBands.capH
    : 0;
  const headGap = titleH ? copyBands.headGap : 0;
  const footGap = capH ? copyBands.footGap : 0;
  const gridX = originX;
  const gridY = originY + titleH + headGap;
  const gridW = width;
  const gridH = Math.max(copyBands.minGrid, height - titleH - headGap - capH - footGap);
  const cols = Math.max(1, Math.floor(numProp(props, "cols", 2)));
  const rows = Math.max(1, Math.floor(numProp(props, "rows", 2)));
  const gaps = figureGapDefaults({
    unit: sceneUnitOf(artifact),
    width,
    cols,
  });
  const gutter = numProp(props, "gutter", gaps.gutter);
  const margin = numProp(props, "margin", gaps.margin);
  const explicitL = props.insetL !== undefined || props.plotPadL !== undefined;
  const explicitR = props.insetR !== undefined || props.plotPadR !== undefined;
  const explicitT = props.insetT !== undefined || props.plotPadT !== undefined;
  const explicitB = props.insetB !== undefined || props.plotPadB !== undefined;
  const count = cols * rows;
  const names = panelNamesFromProps(props, count, index);
  const innerW = gridW - margin * 2;
  const innerH = gridH - margin * 2;
  const cellW = (innerW - gutter * Math.max(0, cols - 1)) / cols;
  const cellH = (innerH - gutter * Math.max(0, rows - 1)) / rows;
  const labels = boolProp(props, "labels", true);
  const decks = boolProp(props, "decks", true);
  const labelItems: SceneItem[] = [];
  const deckItems: SceneItem[] = [];
  const unit = sceneUnitOf(artifact);
  const scale = sceneScaleOf({ unit });
  const toScene = (px: number) => px / Math.max(scale, 1e-6);
  const pad = toScene(3);
  const floor = { l: toScene(10), r: toScene(8), t: toScene(8), b: toScene(10) };
  const clampInset = (
    l: number,
    r: number,
    t: number,
    b: number,
    width: number,
    height: number,
    cap = INSET_CAP_SOFT,
  ) => clampChartInsets({ l, r, t, b }, width, height, floor, cap);

  type CellPlan = {
    name: string;
    cellX0: number;
    cellY0: number;
    cellW: number;
    cellH: number;
    l: number;
    r: number;
    t: number;
    b: number;
  };
  const placed = placeFigureCells(
    names,
    cols,
    rows,
    gridX,
    gridY,
    margin,
    cellW,
    cellH,
    gutter,
    (name) => panelColSpan(artifact, name, cols),
  );
  const pageSpec = parsePage(stringProp(artifact.scene?.props ?? {}, ["page"]));
  const pageH = pageSpec
    ? unit === "mm" || unit === "pt"
      ? pageSpec.h
      : mmToPx(pageSpec.h)
    : 0;
  let cells = placed;
  if (pageH > 0) {
    const sceneHBefore = sceneExtentOf(artifact).h;
    const reserves = figurePageReserves(unit);
    const packed = packFigureCellsToPages(placed, {
      pageH,
      topReserve: reserves.top,
      bottomReserve: reserves.bottom,
    });
    cells = packed.cells;
    const needed = packed.bottom + capH + footGap - originY;
    if (needed > height) height = needed;
    growSceneHeight(artifact, originY + height);
    if (boundSlot) extendBoardAfterPageGrow(artifact, sceneHBefore, sceneExtentOf(artifact).h);
  }
  const plans: CellPlan[] = cells.map((cell) => {
    const estimated = estimatePanelInsets(
      artifact,
      cell.name,
      cell.cellX0,
      cell.cellY0,
      cell.cellW,
      cell.cellH,
    );
    return {
      ...cell,
      l: explicitL ? numProp(props, "insetL", numProp(props, "plotPadL", estimated.l)) : estimated.l,
      r: explicitR ? numProp(props, "insetR", numProp(props, "plotPadR", estimated.r)) : estimated.r,
      t: explicitT ? numProp(props, "insetT", numProp(props, "plotPadT", estimated.t)) : estimated.t,
      b: explicitB ? numProp(props, "insetB", numProp(props, "plotPadB", estimated.b)) : estimated.b,
    };
  });

  const explicitAny = explicitL || explicitR || explicitT || explicitB;
  if (!explicitAny) {
    for (let iter = 0; iter < 4; iter++) {
      const layouts = plans.map((plan) => ({
        cell: {
          x0: plan.cellX0,
          y0: plan.cellY0,
          x1: plan.cellX0 + plan.cellW,
          y1: plan.cellY0 + plan.cellH,
        },
        rects: chromeRectsForPanel(
          artifact,
          plan.name,
          plan.cellX0,
          plan.cellY0,
          plan.cellW,
          plan.cellH,
          plan,
        ),
      }));
      let grew = false;
      for (let i = 0; i < plans.length; i++) {
        const plan = plans[i]!;
        const neighbors: NeighborChrome[] = layouts
          .filter((_, j) => j !== i)
          .map((layout) => ({ cell: layout.cell, rects: layout.rects }));
        const grow = growInsetsForNeighbors(layouts[i]!.rects, layouts[i]!.cell, neighbors, pad);
        if (grow.l <= 0.5 && grow.r <= 0.5 && grow.t <= 0.5 && grow.b <= 0.5) continue;
        const next = clampInset(
          plan.l + grow.l,
          plan.r + grow.r,
          plan.t + grow.t,
          plan.b + grow.b,
          plan.cellW,
          plan.cellH,
          iter >= 3 ? INSET_CAP_FIT : INSET_CAP_SOFT,
        );
        if (
          next.l - plan.l > 0.4 ||
          next.r - plan.r > 0.4 ||
          next.t - plan.t > 0.4 ||
          next.b - plan.b > 0.4
        ) {
          plan.l = next.l;
          plan.r = next.r;
          plan.t = next.t;
          plan.b = next.b;
          grew = true;
        }
      }
      if (!grew) break;
    }
  }

  for (const plan of plans) {
    const { name, cellX0, cellY0, cellW: spanW, cellH: spanH, l: insetL, r: insetR, t: insetT, b: insetB } = plan;
    const plotX0 = cellX0 + insetL;
    const plotY0 = cellY0 + insetT;
    const plotX1 = cellX0 + spanW - insetR;
    const plotY1 = cellY0 + spanH - insetB;
    const existing = artifact.frames.find((f) => f.name === name);
    const frameProps = {
      x: literal([plotX0, plotX1]),
      y: literal([plotY0, plotY1]),
      cellX: literal([cellX0, cellX0 + spanW]),
      cellY: literal([cellY0, cellY0 + spanH]),
      xlim: existing?.props.xlim ?? literal([0, 10]),
      ylim: existing?.props.ylim ?? literal([0, 100]),
    };
    if (existing) {
      existing.props = { ...existing.props, ...frameProps };
    } else {
      artifact.frames.push({ name, span, props: frameProps });
    }
    if (decks && !slotHasAuthorPlot(artifact, name)) {
      deckItems.push(
        node(`${id}_deck_${name}`, {
          role: literal("subpanel"),
          x: literal(cellX0),
          y: literal(cellY0),
          w: literal(spanW),
          h: literal(spanH),
          radius: literal(6),
        }),
      );
    }
    if (labels) {
      const raw = name.includes("_") ? name.slice(name.lastIndexOf("_") + 1) : name;
      labelItems.push(
        node(`${id}_lab_${name}`, {
          role: literal("panel-label"),
          x: literal(cellX0 + 6),
          y: literal(cellY0 + 14),
          text: literal(`(${raw})`),
        }),
      );
    }
  }

  if (plate) {
    artifact.scene?.layers.push({
      name: `__${id}_plate`,
      span,
      props: {},
      items: [
        node(`${id}_plate`, {
          role: literal("panel"),
          x: literal(originX),
          y: literal(originY),
          w: literal(width),
          h: literal(height),
          radius: literal(8),
        }),
      ],
    });
  }
  if (deckItems.length) {
    artifact.scene?.layers.push({
      name: `__${id}_decks`,
      span,
      props: {},
      items: deckItems,
    });
  }
  if (labelItems.length) {
    artifact.scene?.layers.push({
      name: `__${id}_labels`,
      span,
      props: {},
      items: labelItems,
    });
  }
  const copyPlace = figureCopyPlace({
    unit: sceneUnitOf(artifact),
    originX,
    originY,
    width,
    height,
    titleH,
    capH,
    hasSubtitle: Boolean(subtitleExpr),
  });
  const copyItems: SceneItem[] = [];
  if (titleExpr) {
    copyItems.push(
      node(`${id}_title`, {
        role: literal("title"),
        x: literal(copyPlace.titleX),
        y: literal(copyPlace.titleY),
        w: literal(copyPlace.titleW),
        text: titleExpr,
      }),
    );
  }
  if (subtitleExpr) {
    copyItems.push(
      node(`${id}_subtitle`, {
        role: literal("subtitle"),
        x: literal(copyPlace.titleX),
        y: literal(copyPlace.subY),
        w: literal(copyPlace.titleW),
        text: subtitleExpr,
      }),
    );
  }
  if (captionExpr) {
    copyItems.push(
      node(`${id}_caption`, {
        role: literal("caption"),
        x: literal(copyPlace.titleX),
        y: literal(copyPlace.capY),
        w: literal(copyPlace.titleW),
        text: captionExpr,
      }),
    );
  }
  if (copyItems.length) {
    artifact.scene?.layers.push({
      name: `__${id}_copy`,
      span,
      props: {},
      items: copyItems,
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
  const box = resolveLayoutBox(artifact, props);
  const originX = box.x;
  const originY = box.y;
  const width = box.w;
  const height = box.h;
  const titleExpr = copyExpr(props, ["title"]);
  const subtitleExpr = copyExpr(props, ["subtitle"]);
  const captionExpr = copyExpr(props, ["caption"]);
  const bodyExpr = copyExpr(props, ["body", "prose"]);
  const controlKeys = controlKeysFromProps(props);
  const controlBind = stringProp(props, ["bind", "controlBind"]);
  const typeGrid = boolProp(props, "typeGrid", false) || boolProp(props, "baseline", false);
  const typeStep = Math.max(4, numProp(props, "typeGridStep", numProp(props, "baselineStep", 8)));
  const typeCols = Math.max(0, Math.floor(numProp(props, "typeGridCols", 0) || numProp(props, "typeCols", 0)));
  const snapType = (n: number) =>
    typeGrid ? Math.max(typeStep, Math.round(n / typeStep) * typeStep) : n;
  const unit = sceneUnitOf(artifact);
  const scale = sceneScaleOf({ unit });
  const toScene = (px: number) => px / Math.max(scale, 1e-6);
  const bands = estimateBoardBands({
    width: width * scale,
    height: height * scale,
    safe: props.safe !== undefined ? numProp(props, "safe", 64) * scale : undefined,
    titleH: props.titleH !== undefined ? numProp(props, "titleH", 72) * scale : undefined,
    lowerH: props.lowerH !== undefined ? numProp(props, "lowerH", 96) * scale : undefined,
    title: staticCopyText(titleExpr),
    subtitle: staticCopyText(subtitleExpr),
    caption: staticCopyText(captionExpr),
    hasTitle: Boolean(titleExpr),
    hasSubtitle: Boolean(subtitleExpr),
    hasCaption: Boolean(captionExpr),
    controlKeys,
    hasBind: Boolean(controlBind),
  });
  const safe = snapType(toScene(bands.safe));
  const titleH = snapType(toScene(bands.titleH));
  const lowerH = snapType(toScene(bands.lowerH));
  const hudW = toScene(bands.hudW);
  const chipH = toScene(bands.chipH);
  const chipWs = bands.chipWs.map((w) => toScene(w));
  const prefix = stringProp(props, ["prefix"]) ?? "";
  const nameOf = (slot: string) => (prefix ? `${prefix}_${slot}` : slot);

  const safeX0 = originX + safe;
  const safeY0 = originY + safe;
  const safeX1 = originX + width - safe;
  const safeY1 = originY + height - safe;
  const titleY1 = safeY0 + titleH;
  const lowerY0 = safeY1 - lowerH;

  const bleed = Math.max(0, numProp(props, "bleed", 0));
  const trimX0 = originX + bleed;
  const trimY0 = originY + bleed;
  const trimX1 = originX + width - bleed;
  const trimY1 = originY + height - bleed;
  const slots: { name: string; x: [number, number]; y: [number, number] }[] = [
    { name: nameOf("safe"), x: [safeX0, safeX1], y: [safeY0, safeY1] },
    { name: nameOf("title"), x: [safeX0, safeX1], y: [safeY0, titleY1] },
    { name: nameOf("body"), x: [safeX0, safeX1], y: [titleY1, lowerY0] },
    { name: nameOf("lower"), x: [safeX0, safeX1], y: [lowerY0, safeY1] },
    ...(hudW
      ? [{ name: nameOf("hud"), x: [safeX1 - hudW, safeX1] as [number, number], y: [lowerY0, safeY1] as [number, number] }]
      : []),
  ];
  if (bleed > 0) {
    slots.push(
      { name: nameOf("bleed"), x: [originX, originX + width], y: [originY, originY + height] },
      { name: nameOf("trim"), x: [trimX0, trimX1], y: [trimY0, trimY1] },
    );
  }

  const splits = Math.max(0, Math.floor(numProp(props, "splits", 0) || numProp(props, "bodyCols", 0)));
  if (splits >= 2) {
    const gutter = numProp(props, "splitGutter", toScene(24));
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

  if (typeGrid && typeCols >= 2) {
    const gutter = numProp(props, "typeGutter", 0);
    const bodyW = safeX1 - safeX0;
    const cellW = (bodyW - gutter * (typeCols - 1)) / typeCols;
    for (let i = 0; i < typeCols; i++) {
      const x0 = safeX0 + i * (cellW + gutter);
      slots.push({
        name: nameOf(`type${i}`),
        x: [x0, x0 + cellW],
        y: [titleY1, lowerY0],
      });
    }
  }

  const beats = Math.max(0, Math.floor(numProp(props, "beats", 0) || numProp(props, "shots", 0)));
  const beatRects: { x0: number; x1: number; y0: number; y1: number }[] = [];
  if (beats >= 2) {
    const gutter = numProp(props, "beatGutter", toScene(16));
    const bodyW = safeX1 - safeX0;
    const cellW = (bodyW - gutter * (beats - 1)) / beats;
    for (let i = 0; i < beats; i++) {
      const x0 = safeX0 + i * (cellW + gutter);
      beatRects.push({ x0, x1: x0 + cellW, y0: titleY1, y1: lowerY0 });
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
      ...(titleExpr
        ? []
        : [
            node(`${id}_title`, {
              role: literal("label"),
              x: literal(safeX0 + toScene(8)),
              y: literal(safeY0 + toScene(22)),
              text: literal("title"),
            }),
          ]),
      ...(captionExpr
        ? []
        : [
            node(`${id}_lower`, {
              role: literal("label"),
              x: literal(safeX0 + toScene(8)),
              y: literal(lowerY0 + toScene(22)),
              text: literal("lower"),
            }),
          ]),
    ];
    if (beats >= 2) {
      const gutter = numProp(props, "beatGutter", toScene(16));
      const bodyW = safeX1 - safeX0;
      const cellW = (bodyW - gutter * (beats - 1)) / beats;
      for (let i = 0; i < beats; i++) {
        const x0 = safeX0 + i * (cellW + gutter);
        guideItems.push(
          node(`${id}_beat_${i}`, {
            role: literal("label"),
            x: literal(x0 + toScene(8)),
            y: literal(titleY1 + toScene(18)),
            text: literal(String(i + 1)),
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

  const copyItems: SceneItem[] = [];
  const copyW = Math.max(toScene(40), safeX1 - safeX0);
  let titleCursor = safeY0 + toScene(16);
  if (titleExpr) {
    const lines = bands.titleLines.length ? bands.titleLines : [null];
    for (const [i, line] of lines.entries()) {
      copyItems.push(
        node(`${id}_docTitle${i ? `_${i}` : ""}`, {
          role: literal("title"),
          x: literal(safeX0),
          y: literal(titleCursor),
          w: literal(copyW),
          text: line === null ? titleExpr : literal(line),
        }),
      );
      titleCursor += toScene(16);
    }
  }
  if (subtitleExpr) {
    const lines = bands.subtitleLines.length ? bands.subtitleLines : [null];
    for (const [i, line] of lines.entries()) {
      copyItems.push(
        node(`${id}_docSub${i ? `_${i}` : ""}`, {
          role: literal("subtitle"),
          x: literal(safeX0),
          y: literal(titleCursor),
          w: literal(copyW),
          text: line === null ? subtitleExpr : literal(line),
        }),
      );
      titleCursor += toScene(14);
    }
  }
  if (captionExpr) {
    const capW = Math.max(toScene(40), copyW - (hudW ? hudW + toScene(12) : 0));
    let capCursor = lowerY0 + Math.min(toScene(16), lowerH * 0.4);
    const lines = bands.captionLines.length ? bands.captionLines : [null];
    for (const [i, line] of lines.entries()) {
      copyItems.push(
        node(`${id}_docCap${i ? `_${i}` : ""}`, {
          role: literal("caption"),
          x: literal(safeX0),
          y: literal(capCursor),
          w: literal(capW),
          text: line === null ? captionExpr : literal(line),
        }),
      );
      capCursor += toScene(12);
    }
  }
  if (bodyExpr) {
    const typeHosts: typeof slots = [];
    for (let i = 0; i < typeCols; i++) {
      const slot = slots.find((s) => s.name === nameOf(`type${i}`));
      if (slot) typeHosts.push(slot);
    }
    const useTypeFlow = typeGrid && typeHosts.length >= 2 && splits < 2;
    const host =
      slots.find((s) => s.name === nameOf("left")) ?? slots.find((s) => s.name === nameOf("body"));
    if (useTypeFlow || host) {
      const textCols = useTypeFlow ? mergeTypeTextColumns(typeHosts, readableTypeColCount(typeHosts.length)) : null;
      const first = textCols?.[0];
      const bodyW = Math.max(toScene(40), first ? first.x1 - first.x0 : host!.x[1] - host!.x[0]);
      const staticBody = staticCopyText(bodyExpr);
      const wrapW = Math.max(40, bodyW * scale);
      const pageSpec = parsePage(stringProp(artifact.scene?.props ?? {}, ["page"]));
      const pageH = pageSpec
        ? unit === "mm" || unit === "pt"
          ? pageSpec.h
          : mmToPx(pageSpec.h)
        : 0;
      const reserves = pageH ? figurePageReserves(unit) : { top: 0, bottom: 0, pad: 0 };
      const lineH = snapType(toScene(18));
      const startPad = snapType(toScene(16));
      const lines = staticBody
        ? wrapTextLines(staticBody, wrapW, 12, 0.12, pageH || useTypeFlow ? 0 : 24)
        : [];
      if (staticBody && textCols) {
        const packed = packCopyLinesToColumns(
          lines,
          textCols.map((col) => ({
            x: col.x0,
            y0: col.y0 + startPad,
            y1: col.y1 - toScene(4),
            w: col.x1 - col.x0,
          })),
          {
            lineH,
            pageH: pageH || undefined,
            topReserve: reserves.top,
            bottomReserve: reserves.bottom,
          },
        );
        if (pageH) growSceneHeight(artifact, packed.bottom + reserves.bottom);
        const last = packed.places.length - 1;
        for (const [i, place] of packed.places.entries()) {
          const colW = textCols.find((col) => Math.abs(col.x0 - place.x) < 0.5);
          const text =
            packed.clipped && i === last
              ? ellipsizeToWidth(place.text, wrapW, 12, 0.12)
              : place.text;
          copyItems.push(
            node(`${id}_docBody${i ? `_${i}` : ""}`, {
              role: literal("label"),
              x: literal(place.x),
              y: literal(place.y),
              w: literal(colW ? colW.x1 - colW.x0 : bodyW),
              text: literal(text),
            }),
          );
        }
      } else if (staticBody && host) {
        const packed = packCopyLinesToPages(lines, {
          x: host.x[0],
          startY: host.y[0] + startPad,
          lineH,
          pageH: pageH || undefined,
          hostBottom: pageH ? undefined : host.y[1] - toScene(4),
          topReserve: reserves.top,
          bottomReserve: reserves.bottom,
        });
        if (pageH) growSceneHeight(artifact, packed.bottom + reserves.bottom);
        const last = packed.places.length - 1;
        for (const [i, place] of packed.places.entries()) {
          const text =
            packed.clipped && i === last
              ? ellipsizeToWidth(place.text, wrapW, 12, 0.12)
              : place.text;
          copyItems.push(
            node(`${id}_docBody${i ? `_${i}` : ""}`, {
              role: literal("label"),
              x: literal(place.x),
              y: literal(place.y),
              w: literal(bodyW),
              text: literal(text),
            }),
          );
        }
      } else if (host) {
        copyItems.push(
          node(`${id}_docBody`, {
            role: literal("label"),
            x: literal(host.x[0]),
            y: literal(host.y[0] + startPad),
            w: literal(bodyW),
            text: bodyExpr,
          }),
        );
      }
    }
  }
  if (copyItems.length) {
    artifact.scene?.layers.push({
      name: `__${id}_copy`,
      span,
      props: {},
      items: copyItems,
    });
  }

  if (controlKeys.length) {
    const gap = toScene(8);
    const chipY = lowerY0 + Math.max(toScene(8), (lowerH - chipH) / 2);
    let cursorX = safeX1 - toScene(4);
    const ctlItems: SceneItem[] = [];
    for (let i = controlKeys.length - 1; i >= 0; i--) {
      const key = controlKeys[i]!;
      const chipW = chipWs[i] ?? toScene(44);
      cursorX -= chipW;
      const chipName = `${id}_ctl_${i}`;
      const selected =
        controlBind && !boundStateIsNumber(artifact, controlBind)
          ? binary("+", literal(0.4), binary("*", binary("==", ident(controlBind), literal(key), span), literal(0.6), span), span)
          : undefined;
      const paint: Record<string, Expr> = selected ? { opacity: selected } : {};
      const lblName = `${id}_ctlLbl_${i}`;
      ctlItems.push(
        node(chipName, {
          role: literal("chrome"),
          x: literal(cursorX),
          y: literal(chipY),
          w: literal(chipW),
          h: literal(chipH),
          radius: literal(6),
          ...paint,
        }),
        node(lblName, {
          role: literal("label"),
          x: literal(cursorX + chipW / 2),
          y: literal(chipY + chipH * 0.7),
          text: literal(key),
          align: literal("center"),
          ...paint,
        }),
      );
      if (controlBind) {
        const body = controlBindBody(artifact, controlBind, key, props, span);
        for (const target of [chipName, lblName]) {
          if (!artifact.events.some((e) => e.type === "click" && e.target === target)) {
            artifact.events.push({ type: "click", target, body, span });
          }
        }
      }
      cursorX -= gap;
    }
    artifact.scene?.layers.push({
      name: `__${id}_controls`,
      span,
      props: {},
      items: ctlItems,
    });
  }

  const wantCrop = boolProp(props, "crop", bleed > 0);
  if (wantCrop && bleed > 0) {
    const mark = Math.min(18, Math.max(8, bleed * 0.85));
    const gap = 2;
    const corners: [number, number][] = [
      [trimX0, trimY0],
      [trimX1, trimY0],
      [trimX0, trimY1],
      [trimX1, trimY1],
    ];
    const cropItems: SceneItem[] = [];
    corners.forEach(([cx, cy], i) => {
      const sx = cx <= (trimX0 + trimX1) / 2 ? -1 : 1;
      const sy = cy <= (trimY0 + trimY1) / 2 ? -1 : 1;
      cropItems.push(
        node(`${id}_cropH_${i}`, {
          role: literal("chrome"),
          x1: literal(cx + sx * gap),
          y1: literal(cy),
          x2: literal(cx + sx * (gap + mark)),
          y2: literal(cy),
          stroke: literal("#111111"),
          strokeWidth: literal(1),
        }),
        node(`${id}_cropV_${i}`, {
          role: literal("chrome"),
          x1: literal(cx),
          y1: literal(cy + sy * gap),
          x2: literal(cx),
          y2: literal(cy + sy * (gap + mark)),
          stroke: literal("#111111"),
          strokeWidth: literal(1),
        }),
      );
    });
    artifact.scene?.layers.push({
      name: `__${id}_crop`,
      span,
      props: {},
      items: cropItems,
    });
  }

  const play = boolProp(props, "play", false) || boolProp(props, "playing", false);
  if (play && beatRects.length >= 2) {
    if (!artifact.states.some((s) => s.name === "__beat")) {
      artifact.states.push({ name: "__beat", value: literal(0), span });
    }
    const fps = Math.max(0.25, numProp(props, "playFps", 1));
    artifact.ticks.push({
      fps,
      body: [
        assign(
          ["__beat"],
          binary("%", binary("+", ident("__beat"), literal(1), span), literal(beatRects.length), span),
        ),
      ],
      span,
    });
    const veilItems: SceneItem[] = beatRects.map((rect, i) =>
      node(`${id}_veil_${i}`, {
        role: literal("chrome"),
        x: literal(rect.x0),
        y: literal(rect.y0),
        w: literal(rect.x1 - rect.x0),
        h: literal(rect.y1 - rect.y0),
        fill: literal("#000000"),
        opacity: literal(0.55),
        visible: binary("!=", ident("__beat"), literal(i), span),
      }),
    );
    artifact.scene?.layers.push({
      name: `__${id}_play`,
      span,
      props: {},
      items: veilItems,
    });
  }

  if (typeGrid) {
    expandBoardTypeGrid(
      artifact,
      id,
      span,
      { x0: safeX0, x1: safeX1, y0: safeY0, y1: safeY1 },
      typeStep,
      typeCols,
    );
  }
}

function mergeTypeTextColumns(
  hosts: { name: string; x: [number, number]; y: [number, number] }[],
  textCols: number,
): { x0: number; x1: number; y0: number; y1: number }[] {
  const n = Math.max(1, Math.min(textCols, hosts.length));
  const each = Math.floor(hosts.length / n);
  const rem = hosts.length % n;
  const out: { x0: number; x1: number; y0: number; y1: number }[] = [];
  let i = 0;
  for (let c = 0; c < n; c++) {
    const span = each + (c < rem ? 1 : 0);
    const first = hosts[i]!;
    const last = hosts[i + span - 1]!;
    out.push({
      x0: first.x[0],
      x1: last.x[1],
      y0: first.y[0],
      y1: first.y[1],
    });
    i += span;
  }
  return out;
}

function expandBoardTypeGrid(
  artifact: Artifact,
  id: string,
  span: { line: number; column: number },
  box: { x0: number; x1: number; y0: number; y1: number },
  step: number,
  cols: number,
): void {
  const items: SceneItem[] = [];
  const maxLines = 96;
  const height = Math.max(1, box.y1 - box.y0);
  let used = step;
  if (height / used > maxLines) used = Math.ceil(height / maxLines);
  let i = 0;
  for (let y = box.y0; y <= box.y1 + 0.01; y += used) {
    const major = i % 4 === 0;
    items.push(
      node(`${id}_typeGridH_${i}`, {
        role: literal("grid"),
        x1: literal(box.x0),
        y1: literal(y),
        x2: literal(box.x1),
        y2: literal(y),
        stroke: literal("#94a3b8"),
        strokeWidth: literal(major ? 0.7 : 0.4),
        opacity: literal(major ? 0.28 : 0.12),
      }),
    );
    i += 1;
  }
  if (cols >= 2) {
    const cellW = (box.x1 - box.x0) / cols;
    for (let c = 0; c <= cols; c++) {
      const x = box.x0 + c * cellW;
      items.push(
        node(`${id}_typeGridV_${c}`, {
          role: literal("grid"),
          x1: literal(x),
          y1: literal(box.y0),
          x2: literal(x),
          y2: literal(box.y1),
          stroke: literal("#64748b"),
          strokeWidth: literal(0.6),
          dash: literal("3 5"),
          opacity: literal(0.35),
        }),
      );
    }
  }
  artifact.scene?.layers.push({
    name: `__${id}_typeGrid`,
    span,
    props: {},
    items,
  });
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

function panelLabelOf(props: Record<string, Expr>): string | null {
  const panel = stringProp(props, ["panel", "frame"]);
  if (!panel || panel.startsWith("__chart_")) return null;
  const raw = panel.includes("_") ? panel.slice(panel.lastIndexOf("_") + 1) : panel;
  return `(${raw})`;
}

function cellBoxOf(props: Record<string, Expr>): { x0: number; y0: number; x1: number; y1: number } | undefined {
  const xs = numericPair(props.cellX, [Number.NaN, Number.NaN]);
  const ys = numericPair(props.cellY, [Number.NaN, Number.NaN]);
  if (!xs || !ys || !Number.isFinite(xs[0]) || !Number.isFinite(ys[0])) return undefined;
  if (!(xs[1] > xs[0]) || !(ys[1] > ys[0])) return undefined;
  return { x0: xs[0], y0: ys[0], x1: xs[1], y1: ys[1] };
}

function chromeLayoutOf(
  props: Record<string, Expr>,
  artifact: Artifact,
  extras: {
    colorbar?: boolean;
    legendAt?: LegendPlace;
    legendKeys?: string[];
    title?: string;
  } = {},
): { chrome: PaperChrome; rects: ChromeRect[] } | null {
  const box = plotBoxOf(props);
  if (!box) return null;
  const unit = sceneUnitOf(artifact);
  const scale = sceneScaleOf({ unit });
  const compact = isCompactPlot(box, unit);
  const toScene = (px: number) => px / Math.max(scale, 1e-6);
  const yTicks = thinYTicks(
    axisTicks(props, "y").map((t) => ({
      label: t.label,
      y: domainMap(t.value, [box.ymin, box.ymax], [box.py0, box.py1], true, box.yScale),
    })),
    8,
    3,
    toScene,
  );
  const xTicks = thinXTicks(
    axisTicks(props, "x").map((t) => ({
      label: t.label,
      x: domainMap(t.value, [box.xmin, box.xmax], [box.px0, box.px1], false, box.xScale),
    })),
    8,
    4,
    toScene,
  );
  const [z0, z1] = zlimPair(props);
  return placePaperChrome(
    box,
    toScene,
    compact,
    {
      colorbar: extras.colorbar,
      legendAt: extras.legendAt === "off" ? undefined : extras.legendAt,
      legendKeys: extras.legendKeys,
      title: extras.title,
      yCaption: axisCaption(props, "y"),
      xCaption: axisCaption(props, "x"),
      yTicks,
      xTicks,
      panelLabel: panelLabelOf(props),
      cbarLabels: extras.colorbar
        ? [formatTickValue(z0), formatTickValue((z0 + z1) / 2), formatTickValue(z1)]
        : [],
      zCaption: extras.colorbar ? axisCaption(props, "z") : null,
    },
    cellBoxOf(props),
  );
}

function paperChromeOf(
  props: Record<string, Expr>,
  artifact: Artifact,
  extras: {
    colorbar?: boolean;
    legendAt?: LegendPlace;
    legendKeys?: string[];
    title?: string;
  } = {},
): PaperChrome | null {
  return chromeLayoutOf(props, artifact, extras)?.chrome ?? null;
}

function controlKeysFromProps(props: Record<string, Expr>): string[] {
  const expr = props.controls ?? props.chips;
  if (expr?.kind !== "array") return [];
  return expr.items
    .map((item) =>
      item.kind === "string" ? item.value : item.kind === "ident" ? item.path.join(".") : "",
    )
    .filter(Boolean);
}

function copyExpr(props: Record<string, Expr>, keys: string[]): Expr | undefined {
  for (const key of keys) {
    const expr = props[key];
    if (!expr) continue;
    if (expr.kind === "string" && expr.value === "") continue;
    return expr;
  }
  return undefined;
}

function staticCopyText(expr: Expr | undefined): string | null {
  return expr?.kind === "string" ? expr.value : null;
}

function frameBoxOf(
  artifact: Artifact,
  name: string,
): { x: number; y: number; w: number; h: number } | null {
  const fr = artifact.frames.find((f) => f.name === name);
  if (!fr) return null;
  const xs = numericPair(fr.props.x, [Number.NaN, Number.NaN]);
  const ys = numericPair(fr.props.y, [Number.NaN, Number.NaN]);
  if (!xs || !ys || !Number.isFinite(xs[0]) || !Number.isFinite(ys[0])) return null;
  const w = xs[1] - xs[0];
  const h = ys[1] - ys[0];
  if (!(w > 0) || !(h > 0)) return null;
  return { x: xs[0], y: ys[0], w, h };
}

/** Scene fill when x/y/w/h omitted; `panel`/`frame` inherit a board slot. */
function resolveLayoutBox(
  artifact: Artifact,
  props: Record<string, Expr>,
): { x: number; y: number; w: number; h: number } {
  const bound = stringProp(props, ["panel", "frame"]);
  if (bound) {
    const slot = frameBoxOf(artifact, bound);
    if (slot) return slot;
  }
  const extent = sceneExtentOf(artifact);
  const measure = sceneColumnMeasure(artifact);
  const x =
    props.x !== undefined && !isPair(props.x)
      ? numProp(props, "x", 0)
      : measure
        ? measure.x
        : 0;
  const y = props.y !== undefined && !isPair(props.y) ? numProp(props, "y", 0) : 0;
  const w =
    props.w !== undefined
      ? numProp(props, "w", extent.w)
      : measure
        ? measure.w
        : Math.max(1, extent.w - x);
  const h = props.h !== undefined ? numProp(props, "h", extent.h) : Math.max(1, extent.h - y);
  return { x, y, w, h };
}

/**
 * After a slot-bound figure hops the page knife and grows the scene, keep
 * board lower/hud/caption on the last slice and stretch body/right with it.
 * Not a verso/recto reflow.
 */
function extendBoardAfterPageGrow(artifact: Artifact, oldH: number, newH: number): void {
  const dy = newH - oldH;
  if (!(dy > 1e-6)) return;
  const lower = artifact.frames.find((f) => f.name === "lower" || f.name.endsWith("_lower"));
  const lowerY = lower ? numericPair(lower.props.y, [oldH, oldH]) : null;
  const oldLowerY0 = lowerY ? lowerY[0] : oldH;
  const shiftBase = new Set(["lower", "hud"]);
  const extendBase = new Set(["safe", "body", "left", "right", "bleed", "trim"]);
  const baseOf = (name: string) => {
    if (name.startsWith("type") || name.startsWith("beat") || name.startsWith("split")) return name;
    const parts = name.split("_");
    return parts[parts.length - 1] ?? name;
  };
  for (const frame of artifact.frames) {
    const y = numericPair(frame.props.y, [0, 0]);
    if (!y) continue;
    const base = baseOf(frame.name);
    if (shiftBase.has(base)) {
      frame.props.y = literal([y[0] + dy, y[1] + dy]);
    } else if (extendBase.has(base) || nameLooksLikeSplit(frame.name)) {
      frame.props.y = literal([y[0], y[1] + dy]);
    }
  }
  for (const layer of artifact.scene?.layers ?? []) {
    if (
      !layer.name.includes("_copy") &&
      !layer.name.includes("_guides") &&
      !layer.name.includes("_controls")
    ) {
      continue;
    }
    for (const item of layer.items) {
      if (item.kind !== "node") continue;
      const y = numericLiteral(item.props.y);
      if (y !== null && y >= oldLowerY0 - 1) item.props.y = literal(y + dy);
    }
  }
}

function nameLooksLikeSplit(name: string): boolean {
  return /^(type\d+|beat\d+|split\d+)$/.test(name) || /_(type\d+|beat\d+|split\d+)$/.test(name);
}

function growSceneHeight(artifact: Artifact, nextH: number): void {
  const props = artifact.scene?.props;
  if (!props || !(nextH > 0)) return;
  const current = sceneExtentOf(artifact).h;
  if (nextH <= current + 1e-6) return;
  const width = sceneExtentOf(artifact).w;
  props.height = literal(nextH);
  if (props.size?.kind === "array" && props.size.items.length >= 2) {
    props.size = literal([width, nextH]);
  }
}

function sceneExtentOf(artifact: Artifact): { w: number; h: number } {
  const props = artifact.scene?.props ?? {};
  let w = 880;
  let h = 480;
  if (props.size?.kind === "array" && props.size.items.length >= 2) {
    const a = numericLiteral(props.size.items[0]);
    const b = numericLiteral(props.size.items[1]);
    if (a !== null) w = a;
    if (b !== null) h = b;
  }
  if (props.width?.kind === "number") w = props.width.value;
  if (props.height?.kind === "number") h = props.height.value;
  const column = stringProp(props, ["column"]);
  const page = parsePage(stringProp(props, ["page"]));
  if (page && stringProp(props, ["unit"]) === "mm") {
    if (props.width === undefined && props.size === undefined) w = page.w;
    if (props.height === undefined && props.size === undefined) h = page.h;
  } else if (
    (column === "single" || column === "double") &&
    props.width === undefined &&
    props.size === undefined
  ) {
    w = COLUMN_MM[column];
  }
  return { w, h };
}

function sceneColumnMeasure(artifact: Artifact): { x: number; w: number } | null {
  const props = artifact.scene?.props ?? {};
  const column = stringProp(props, ["column"]);
  const page = parsePage(stringProp(props, ["page"]));
  return pageColumnMeasure(
    page,
    column === "single" || column === "double" ? column : undefined,
  );
}

function panelColSpan(artifact: Artifact, panelName: string, cols: number): number {
  const chart = chartForPanel(artifact, panelName);
  if (!chart) return 1;
  const raw = numProp(chart.props, "span", numProp(chart.props, "colspan", 1));
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.min(cols, Math.floor(raw)));
}

function placeFigureCells(
  names: string[],
  cols: number,
  rows: number,
  gridX: number,
  gridY: number,
  margin: number,
  cellW: number,
  cellH: number,
  gutter: number,
  spanOf: (name: string) => number,
): { name: string; cellX0: number; cellY0: number; cellW: number; cellH: number }[] {
  const taken = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
  const out: { name: string; cellX0: number; cellY0: number; cellW: number; cellH: number }[] = [];
  for (const name of names) {
    const span = spanOf(name);
    let placed = false;
    for (let r = 0; r < rows && !placed; r++) {
      for (let c = 0; c <= cols - span && !placed; c++) {
        let free = true;
        for (let k = 0; k < span; k++) {
          if (taken[r]![c + k]) {
            free = false;
            break;
          }
        }
        if (!free) continue;
        for (let k = 0; k < span; k++) taken[r]![c + k] = true;
        out.push({
          name,
          cellX0: gridX + margin + c * (cellW + gutter),
          cellY0: gridY + margin + r * (cellH + gutter),
          cellW: cellW * span + gutter * Math.max(0, span - 1),
          cellH,
        });
        placed = true;
      }
    }
  }
  return out;
}

function chartForPanel(
  artifact: Artifact,
  panelName: string,
): { name: string; props: Record<string, Expr> } | undefined {
  return artifact.widgets.find((w) => {
    if (!w.name.startsWith("chart.")) return false;
    return stringProp(w.props, ["panel", "frame"]) === panelName;
  });
}

function estimatePanelInsets(
  artifact: Artifact,
  panelName: string,
  cellX0: number,
  cellY0: number,
  cellW: number,
  cellH: number,
): { l: number; r: number; t: number; b: number } {
  const fallback = { l: 76, r: 32, t: 32, b: 52 };
  const chart = chartForPanel(artifact, panelName);
  if (chart) return fitChartInsets(artifact, chart, cellX0, cellY0, cellW, cellH);
  if (slotHasAuthorPlot(artifact, panelName)) return { ...PLOT_SLOT_INSET };
  return fallback;
}

function chartChromeExtras(
  artifact: Artifact,
  chart: { name: string; props: Record<string, Expr> },
): {
  colorbar?: boolean;
  legendAt?: Exclude<LegendPlace, "off">;
  legendKeys?: string[];
  title?: string;
} {
  const title =
    chart.props.title?.kind === "string"
      ? chart.props.title.value
      : chart.props.title?.kind === "ident"
        ? chart.props.title.path.join(".")
        : "";
  const dataName =
    chart.props.data?.kind === "ident"
      ? chart.props.data.path.join(".")
      : chart.props.source?.kind === "ident"
        ? chart.props.source.path.join(".")
        : "series";
  const seriesField = seriesFieldName(chart.props);
  const legendAt = legendPlacement(chart.props, seriesField);
  const keys = seriesField ? uniqueSeriesKeys(artifact, dataName, seriesField) : [];
  return {
    colorbar: chart.name === "chart.heatmap",
    legendAt: seriesField && legendAt !== "off" ? legendAt : undefined,
    legendKeys: keys,
    title,
  };
}

function chromeRectsForPanel(
  artifact: Artifact,
  panelName: string,
  cellX0: number,
  cellY0: number,
  cellW: number,
  cellH: number,
  insets: { l: number; r: number; t: number; b: number },
): ChromeRect[] {
  const chart = chartForPanel(artifact, panelName);
  if (!chart) return [];
  const geom: Record<string, Expr> = {
    ...chart.props,
    areaX: literal([cellX0 + insets.l, Math.max(cellX0 + insets.l + 8, cellX0 + cellW - insets.r)]),
    areaY: literal([cellY0 + insets.t, Math.max(cellY0 + insets.t + 8, cellY0 + cellH - insets.b)]),
    cellX: literal([cellX0, cellX0 + cellW]),
    cellY: literal([cellY0, cellY0 + cellH]),
  };
  return chromeLayoutOf(geom, artifact, chartChromeExtras(artifact, chart))?.rects ?? [];
}

function fitChartInsets(
  artifact: Artifact,
  chart: { name: string; props: Record<string, Expr> },
  cellX0: number,
  cellY0: number,
  cellW: number,
  cellH: number,
): { l: number; r: number; t: number; b: number } {
  const unit = sceneUnitOf(artifact);
  const scale = sceneScaleOf({ unit });
  const toScene = (px: number) => px / Math.max(scale, 1e-6);
  const pad = toScene(3);
  const extras = chartChromeExtras(artifact, chart);
  const floor = { l: toScene(10), r: toScene(8), t: toScene(8), b: toScene(10) };
  let l = floor.l;
  let r = floor.r;
  let t = floor.t;
  let b = floor.b;
  let cap = INSET_CAP_SOFT;
  const clamp = () => {
    const next = clampChartInsets({ l, r, t, b }, cellW, cellH, floor, cap);
    l = next.l;
    r = next.r;
    t = next.t;
    b = next.b;
  };
  clamp();
  for (let iter = 0; iter < 12; iter++) {
    const geom: Record<string, Expr> = {
      ...chart.props,
      areaX: literal([cellX0 + l, Math.max(cellX0 + l + 8, cellX0 + cellW - r)]),
      areaY: literal([cellY0 + t, Math.max(cellY0 + t + 8, cellY0 + cellH - b)]),
      cellX: literal([cellX0, cellX0 + cellW]),
      cellY: literal([cellY0, cellY0 + cellH]),
    };
    const layout = chromeLayoutOf(geom, artifact, extras);
    if (!layout) break;
    const grow = growInsetsForChrome(layout.rects, {
      x0: cellX0,
      y0: cellY0,
      x1: cellX0 + cellW,
      y1: cellY0 + cellH,
    }, pad);
    if (grow.l <= 0.5 && grow.r <= 0.5 && grow.t <= 0.5 && grow.b <= 0.5) break;
    if (iter >= 7) cap = INSET_CAP_FIT;
    l += grow.l;
    r += grow.r;
    t += grow.t;
    b += grow.b;
    clamp();
  }
  return { l, r, t, b };
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
  const { w, h } = sceneExtentOf(artifact);
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
  chrome: PaperChrome | null = null,
): SceneItem[] {
  const xlim = numericPair(props.xlim, [0, 10]);
  const ylim = numericPair(props.ylim, [0, 100]);
  if (!xlim || !ylim) return [];

  const items: SceneItem[] = [];
  const box = plotBoxOf(props);
  const unit = sceneUnitOf(artifact);
  let xTicks = axisTicks(props, "x");
  let yTicks = axisTicks(props, "y");
  if (box) {
    const toScene = (px: number) => px / Math.max(sceneScaleOf({ unit }), 1e-6);
    xTicks = thinXTicks(
      xTicks.map((t) => ({
        ...t,
        x: domainMap(t.value, [box.xmin, box.xmax], [box.px0, box.px1], false, box.xScale),
      })),
      8,
      4,
      toScene,
    );
    yTicks = thinYTicks(
      yTicks.map((t) => ({
        ...t,
        y: domainMap(t.value, [box.ymin, box.ymax], [box.py0, box.py1], true, box.yScale),
      })),
      8,
      3,
      toScene,
    );
  }
  const compact = box ? isCompactPlot(box, unit) : isCompactScene(artifact);
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
      const sy = chrome?.xTickY ?? box.py1 + (compact ? 11 : 15);
      items.push(
        node(`${frameName}_xtick_${i}`, {
          role: literal("label"),
          x: literal(sx),
          y: literal(sy),
          text: literal(tick.label),
          align: literal("center"),
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
      const sx = chrome?.yTickX ?? Math.max(compact ? 6 : 10, box.px0 - (compact ? 5 : 8));
      items.push(
        node(`${frameName}_ytick_${i}`, {
          role: literal("label"),
          x: literal(sx),
          y: literal(sy),
          text: literal(tick.label),
          align: literal("right"),
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
  chrome: PaperChrome | null = null,
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
      swatchX = (chrome?.legendX ?? plotX0 + 8) + i * (chrome?.legendStep ?? 72);
      swatchY = chrome?.legendY ?? plotY1 + 32;
    } else if (place === "inside") {
      swatchX = chrome?.legendX ?? plotX0 + 12;
      swatchY = (chrome?.legendY ?? plotY1 - 14) - i * 14;
    } else {
      swatchX = chrome?.legendX ?? plotX1 + 10;
      swatchY = (chrome?.legendY ?? plotY0 + 12) + i * 14;
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
    );
    const legendLines = chrome?.legendLines?.[i]?.length ? chrome.legendLines[i]! : [key];
    const legendLineH = chrome?.legendLineH ?? 10;
    for (const [j, line] of legendLines.entries()) {
      items.push(
        node(`${frameName}_legLbl_${i}${j ? `_${j}` : ""}`, {
          role: literal("legend-label"),
          x: literal(swatchX + 14),
          y: literal(swatchY + j * legendLineH),
          text: literal(line),
        }),
      );
    }
    if (!artifact.events.some((e) => e.type === "click" && e.target === `${frameName}_leg_${i}`)) {
      ensureInteractStates(artifact, span);
      if (!artifact.states.some((s) => s.name === "__legPick")) {
        artifact.states.push({ name: "__legPick", value: noneExpr(span), span });
      }
      const clearSel: Statement[] = [
        assign(["__highlightGrp"], noneExpr(span)),
        assign(["__sel", "keys"], { kind: "array", items: [], span }),
        assign(["__sel", "n"], literal(0)),
        assign(["__sel", "xField"], literal("")),
      ];
      const setSel: Statement[] = [
        assign(["__highlightGrp"], literal(key)),
        assign(["__sel", "keys"], { kind: "array", items: [literal(key)], span }),
        assign(["__sel", "n"], literal(1)),
        assign(["__sel", "xField"], literal(seriesField)),
      ];
      artifact.events.push({
        type: "click",
        target: `${frameName}_leg_${i}`,
        body: [
          assign(["__legPick"], ident("__highlightGrp")),
          {
            kind: "if",
            cond: binary("==", ident("__legPick"), literal(key), span),
            body: clearSel,
            span,
          },
          {
            kind: "if",
            cond: binary("!=", ident("__legPick"), literal(key), span),
            body: setSel,
            span,
          },
        ],
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

function axisCaption(props: Record<string, Expr>, axis: "x" | "y" | "z"): string | null {
  const label =
    axis === "x"
      ? stringProp(props, ["xLabel", "xlabel", "xTitle"])
      : axis === "y"
        ? stringProp(props, ["yLabel", "ylabel", "yTitle"])
        : stringProp(props, ["zLabel", "zlabel", "zTitle", "colorLabel"]);
  const unit =
    axis === "x"
      ? stringProp(props, ["xUnit", "xunit"])
      : axis === "y"
        ? stringProp(props, ["yUnit", "yunit"])
        : stringProp(props, ["zUnit", "zunit", "colorUnit"]);
  if (!label && !unit) return null;
  if (label && unit) return `${label} (${unit})`;
  return label ?? unit;
}

function expandAxisTitles(
  frameName: string,
  props: Record<string, Expr>,
  span: { line: number; column: number },
  artifact: Artifact,
  chrome: PaperChrome | null = null,
): SceneItem[] {
  const items: SceneItem[] = [];
  const x0 = pairAt(props.areaX ?? props.x, 0, 80);
  const x1 = pairAt(props.areaX ?? props.x, 1, 720);
  const y0 = pairAt(props.areaY ?? props.y, 0, 60);
  const y1 = pairAt(props.areaY ?? props.y, 1, 400);
  const midX = binary("+", x0, binary("*", binary("-", x1, x0, span), literal(0.5), span), span);
  const midY = binary("+", y0, binary("*", binary("-", y1, y0, span), literal(0.5), span), span);
  const box = plotBoxOf(props);
  const compact = chrome?.compact ?? (box ? isCompactPlot(box, sceneUnitOf(artifact)) : isCompactScene(artifact));
  const xCap = axisCaption(props, "x");
  const yCap = axisCaption(props, "y");
  const xLines = chrome?.xTitleLines?.length ? chrome.xTitleLines : xCap ? [xCap] : [];
  const yLines = chrome?.yTitleLines?.length ? chrome.yTitleLines : yCap ? [yCap] : [];
  const axisLine = chrome?.axisLineH ?? 11;
  for (const [i, line] of xLines.entries()) {
    items.push(
      node(`${frameName}_xTitle${i ? `_${i}` : ""}`, {
        role: literal("annotation"),
        x: midX,
        y: chrome
          ? literal(chrome.xTitleY + i * axisLine)
          : binary("+", y1, literal((compact ? 22 : 32) + i * axisLine), span),
        text: literal(line),
        align: literal("center"),
      }),
    );
  }
  if (yLines.length) {
    const left =
      chrome?.yTitleX ??
      (x0.kind === "number" ? Math.max(compact ? 8 : 14, x0.value - (compact ? 20 : 40)) : 16);
    for (const [i, line] of yLines.entries()) {
      items.push(
        node(`${frameName}_yTitle${i ? `_${i}` : ""}`, {
          role: literal("annotation"),
          x: literal(left - (yLines.length - 1 - i) * axisLine),
          y: midY,
          text: literal(line),
          align: literal("center"),
          rotate: literal(-90),
        }),
      );
    }
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

function heatTierExpr(value: Expr, z0: number, z1: number, span: { line: number; column: number }): Expr {
  const range = binary("-", literal(z1), literal(z0), span);
  const norm = binary("/", binary("-", value, literal(z0), span), range, span);
  return {
    kind: "call",
    callee: "clamp",
    args: [
      { kind: "call", callee: "round", args: [binary("*", norm, literal(6), span)], span },
      literal(0),
      literal(6),
    ],
    span,
  };
}

function expandHeatCells(
  artifact: Artifact,
  props: Record<string, Expr>,
  dataName: string,
  frameName: string,
  xField: string,
  yField: string,
  span: { line: number; column: number },
  interact: Record<string, Expr> = {},
): SceneItem[] {
  const vField = valueFieldName(props);
  const [z0, z1] = zlimPair(props);
  const cellW = props.cellW?.kind === "number" ? props.cellW.value : 1;
  const cellH = props.cellH?.kind === "number" ? props.cellH.value : 1;
  const heatFill = (value: Expr) => ({
    kind: "call" as const,
    callee: "palette",
    args: [heatTierExpr(value, z0, z1, span), { kind: "string" as const, value: "sequential", span }],
    span,
  });
  const heatMeta = {
    __chartHeat: literal(true),
    __heatData: literal(dataName),
    __heatXField: literal(xField),
    __heatYField: literal(yField),
    __heatVField: literal(vField),
    __heatZ0: literal(z0),
    __heatZ1: literal(z1),
  };
  const decl = artifact.data.find((d) => d.name === dataName);
  const groups = new Map<string, { x: string | number; y: string | number; values: number[] }>();
  if (decl?.value.kind === "array") {
    for (const row of decl.value.items) {
      if (row.kind !== "object") continue;
      const vv = objectField(row, vField);
      if (vv?.kind !== "number") continue;
      const xk = rowGroupKey(row, xField);
      const yk = rowGroupKey(row, yField);
      const xv = objectField(row, xField);
      const yv = objectField(row, yField);
      const x = xv?.kind === "number" ? xv.value : xk;
      const y = yv?.kind === "number" ? yv.value : yk;
      const g = groups.get(`${xk}\t${yk}`) ?? { x, y, values: [] };
      g.values.push(vv.value);
      groups.set(`${xk}\t${yk}`, g);
    }
  }
  if (groups.size) {
    return [...groups.values()].map((g) =>
      node("heatCell", {
        role: literal("mark-area"),
        frame: literal(frameName),
        x: literal(g.x),
        y: literal(g.y),
        w: literal(cellW),
        h: literal(cellH),
        fill: heatFill(literal(meanOf(g.values))),
        stroke: literal("#ffffff"),
        strokeWidth: literal(0.6),
        ...heatMeta,
        __heatXVal: literal(g.x),
        __heatYVal: literal(g.y),
        ...markSelKeysVisible([String(g.x), String(g.y)], frameName, span),
      }),
    );
  }
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
          fill: heatFill(ident(`row.${vField}`)),
          stroke: literal("#ffffff"),
          strokeWidth: literal(0.6),
          ...heatMeta,
          __heatXVal: ident(`row.${xField}`),
          __heatYVal: ident(`row.${yField}`),
          ...interact,
        }),
      ],
    },
  ];
}

function meanOf(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
}

function expandColorbar(
  frameName: string,
  props: Record<string, Expr>,
  span: { line: number; column: number },
  chrome: PaperChrome | null = null,
): SceneItem[] {
  const [z0, z1] = zlimPair(props);
  const x1 = pairAt(props.areaX ?? props.x, 1, 720);
  const y0 = pairAt(props.areaY ?? props.y, 0, 60);
  const y1 = pairAt(props.areaY ?? props.y, 1, 400);
  const barX = chrome?.cbarX ?? (x1.kind === "number" ? x1.value + 10 : 730);
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
      const slot = i === 0 ? 0 : i === steps - 1 ? 2 : 1;
      const lines = chrome?.cbarLines?.[slot]?.length
        ? chrome.cbarLines[slot]!
        : [formatTickValue(value)];
      for (const [li, line] of lines.entries()) {
        items.push(
          node(`${frameName}_cbarLbl_${i}${li ? `_${li}` : ""}`, {
            role: literal("label"),
            x: literal(barX + 14),
            y: literal(bot - t * h + 3 + li * 10),
            text: literal(line),
          }),
        );
      }
    }
  }
  if (chrome?.cbarTitleLines?.length) {
    for (const [i, line] of chrome.cbarTitleLines.entries()) {
      items.push(
        node(`${frameName}_cbarTitle${i ? `_${i}` : ""}`, {
          role: literal("label"),
          x: literal(chrome.cbarTitleX),
          y: literal(chrome.cbarTitleY + i * 11),
          text: literal(line),
        }),
      );
    }
  }
  return items;
}

function rowGroupKey(row: Extract<Expr, { kind: "object" }>, field: string): string {
  const xf = objectField(row, field);
  if (xf?.kind === "number") return String(xf.value);
  if (xf?.kind === "string") return xf.value;
  return "0";
}

function rowGroupX(
  row: Extract<Expr, { kind: "object" }>,
  field: string,
  fallback: number,
): number {
  const xf = objectField(row, field);
  if (xf?.kind === "number" && Number.isFinite(xf.value)) return xf.value;
  const n = Number(rowGroupKey(row, field));
  return Number.isFinite(n) ? n : fallback;
}

function expandBoxMarks(
  artifact: Artifact,
  dataName: string,
  frameName: string,
  xField: string,
  sourceXField: string,
  yField: string,
  seriesField: string | null,
  geom: Record<string, Expr>,
  span: { line: number; column: number },
): SceneItem[] {
  const decl = artifact.data.find((d) => d.name === dataName);
  if (!decl || decl.value.kind !== "array") return [];
  const idField = sourceXField || xField;
  const groups = new Map<string, { values: number[]; x: number }>();
  for (const row of decl.value.items) {
    if (row.kind !== "object") continue;
    const yv = objectField(row, yField);
    if (yv?.kind !== "number") continue;
    const key = rowGroupKey(row, idField);
    const g = groups.get(key) ?? { values: [], x: rowGroupX(row, xField, groups.size) };
    g.values.push(yv.value);
    groups.set(key, g);
  }
  const cats = catsFromExpr(geom.xCats);
  const allKeys = [...groups.keys()];
  const items: SceneItem[] = [];
  let i = 0;
  for (const [key, { values, x }] of groups) {
    const stats = boxStats(values);
    if (!stats) continue;
    const { q1, med, q3, whiskLo, whiskHi } = stats;
    const iqr = q3 - q1;
    const loFence = q1 - 1.5 * iqr;
    const hiFence = q3 + 1.5 * iqr;
    const label = cats[x] ?? key;
    const selVis = markSelKeysVisible([key, label], frameName, span);
    const boxMeta = {
      __boxData: literal(dataName),
      __boxKey: literal(key),
      __boxXField: literal(idField),
      __boxYField: literal(yField),
      __boxCats: literal(allKeys),
    };
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
        ...selVis,
        ...boxMeta,
        __boxPart: literal("whisk"),
        x1: literal(x),
        y1: literal(whiskLo),
        x2: literal(x),
        y2: literal(whiskHi),
        strokeWidth: literal(1.2),
      }),
      node(`box`, {
        role: literal("mark"),
        frame: literal(frameName),
        ...selVis,
        ...boxMeta,
        __boxPart: literal("body"),
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
        ...selVis,
        ...boxMeta,
        __boxPart: literal("med"),
        x1: literal(x - 0.22),
        y1: literal(med),
        x2: literal(x + 0.22),
        y2: literal(med),
        strokeWidth: literal(1.6),
      }),
    );
    for (const v of values) {
      if (v >= loFence && v <= hiFence) continue;
      items.push(
        node(`boxOut_${i}_${v}`, {
          role: literal("mark"),
          frame: literal(frameName),
          ...selVis,
          ...boxMeta,
          __boxPart: literal("out"),
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
        align: literal("center"),
      }),
    );
    slot += 1;
  }
  return items;
}

function expandViolinMarks(
  artifact: Artifact,
  dataName: string,
  frameName: string,
  xField: string,
  sourceXField: string,
  yField: string,
  geom: Record<string, Expr>,
  span: { line: number; column: number },
): SceneItem[] {
  const decl = artifact.data.find((d) => d.name === dataName);
  if (!decl || decl.value.kind !== "array") return [];
  const idField = sourceXField || xField;
  const groups = new Map<string, { values: number[]; x: number }>();
  for (const row of decl.value.items) {
    if (row.kind !== "object") continue;
    const yv = objectField(row, yField);
    if (yv?.kind !== "number") continue;
    const key = rowGroupKey(row, idField);
    const g = groups.get(key) ?? { values: [], x: rowGroupX(row, xField, groups.size) };
    g.values.push(yv.value);
    groups.set(key, g);
  }
  const box = plotBoxOf(geom);
  const cats = catsFromExpr(geom.xCats);
  const allKeys = [...groups.keys()];
  const items: SceneItem[] = [];
  let gi = 0;
  const nGroups = Math.max(1, groups.size);
  for (const [key, { values, x }] of groups) {
    const label = cats[x] ?? key;
    const selVis = markSelKeysVisible([key, label], frameName, span);
    const violinMeta = {
      __violinData: literal(dataName),
      __violinKey: literal(key),
      __violinXField: literal(idField),
      __violinYField: literal(yField),
      __violinCats: literal(allKeys),
      __violinFrame: literal(frameName),
    };
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
          ...selVis,
          ...violinMeta,
          __violinPart: literal("shape"),
          __violinCx: literal(cx),
          __violinYmin: literal(ymin),
          __violinYmax: literal(ymax),
          __violinPy0: literal(box.py0),
          __violinPy1: literal(box.py1),
          __violinYScale: literal(box.yScale),
          __violinHalf: literal(halfStep),
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
            ...selVis,
            ...violinMeta,
            __violinPart: literal("bin"),
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
        ...selVis,
        ...violinMeta,
        __violinPart: literal("med"),
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
  return markInteractOpacity(seriesField, null, null, "", null, span, false);
}

function selLinkMode(props: Record<string, Expr>): "filter" | "dim" {
  const raw = props.link ?? props.selLink ?? props.selection;
  if (!raw) return "filter";
  if (raw.kind === "boolean") return raw.value ? "filter" : "dim";
  const s =
    raw.kind === "string" ? raw.value : raw.kind === "ident" ? raw.path.join(".") : "";
  const norm = s.toLowerCase();
  if (norm === "dim" || norm === "fade" || norm === "opacity") return "dim";
  return "filter";
}

function selHideExpr(
  seriesField: string | null,
  xField: string | null,
  frameName: string,
  span: { line: number; column: number },
  loopVar = "row",
): Expr | null {
  if (!xField && !seriesField) return null;
  const inSelX = xField
    ? callExpr("has", [ident("__sel.keys"), ident(`${loopVar}.${xField}`)], span)
    : literal(0);
  const inSelG = seriesField
    ? callExpr("has", [ident("__sel.keys"), ident(`${loopVar}.${seriesField}`)], span)
    : literal(0);
  const inSel = binary("or", inSelX, inSelG, span);
  const otherFrame = binary("!=", ident("__brush.frame"), literal(frameName), span);
  const notInSel: Expr = { kind: "unary", op: "not", expr: inSel, span };
  return binary("and", ident("__sel.n"), binary("and", otherFrame, notInSel, span), span);
}

function markSelVisible(
  seriesField: string | null,
  xField: string | null,
  frameName: string,
  span: { line: number; column: number },
  loopVar = "row",
): Record<string, Expr> {
  const hide = selHideExpr(seriesField, xField, frameName, span, loopVar);
  if (!hide) return {};
  return { visible: { kind: "unary", op: "not", expr: hide, span } };
}

function markSelKeysVisible(
  keys: string[],
  frameName: string,
  span: { line: number; column: number },
): Record<string, Expr> {
  const uniq = [...new Set(keys.filter(Boolean))];
  if (!uniq.length) return {};
  const needles: Expr[] = [];
  for (const key of uniq) {
    needles.push(literal(key));
    const n = Number(key);
    if (Number.isFinite(n) && String(n) === key) needles.push(literal(n));
  }
  const inSel = needles
    .map((needle) => callExpr("has", [ident("__sel.keys"), needle], span))
    .reduce((acc, part) => binary("or", acc, part, span));
  const otherFrame = binary("!=", ident("__brush.frame"), literal(frameName), span);
  const hide = binary(
    "and",
    ident("__sel.n"),
    binary("and", otherFrame, { kind: "unary", op: "not", expr: inSel, span }, span),
    span,
  );
  return { visible: { kind: "unary", op: "not", expr: hide, span } };
}

function markInteractOpacity(
  seriesField: string | null,
  xField: string | null,
  yField: string | null,
  frameName: string,
  linkXField: string | null,
  span: { line: number; column: number },
  includeSelDim = false,
  loopVar = "row",
): Record<string, Expr> {
  const parts: Expr[] = [];
  if (seriesField) {
    parts.push(
      binary(
        "and",
        binary("!=", ident("__highlightGrp"), noneExpr(span), span),
        binary("!=", ident(`${loopVar}.${seriesField}`), ident("__highlightGrp"), span),
        span,
      ),
    );
  }
  if (xField && yField) {
    const loX = callExpr("min", [ident("__brush.dx0"), ident("__brush.dx1")], span);
    const hiX = callExpr("max", [ident("__brush.dx0"), ident("__brush.dx1")], span);
    const loY = callExpr("min", [ident("__brush.dy0"), ident("__brush.dy1")], span);
    const hiY = callExpr("max", [ident("__brush.dy0"), ident("__brush.dy1")], span);
    const outRectX = binary(
      "or",
      binary("<", ident(`${loopVar}.${xField}`), loX, span),
      binary(">", ident(`${loopVar}.${xField}`), hiX, span),
      span,
    );
    const outRectY = binary(
      "or",
      binary("<", ident(`${loopVar}.${yField}`), loY, span),
      binary(">", ident(`${loopVar}.${yField}`), hiY, span),
      span,
    );
    const outPoly = {
      kind: "unary" as const,
      op: "not" as const,
      expr: callExpr(
        "inside",
        [ident(`${loopVar}.${xField}`), ident(`${loopVar}.${yField}`), ident("__brush.dpts")],
        span,
      ),
      span,
    };
    const outBox = binary(
      "or",
      binary("and", { kind: "unary", op: "not", expr: ident("__brush.mode"), span }, binary("or", outRectX, outRectY, span), span),
      binary("and", ident("__brush.mode"), outPoly, span),
      span,
    );
    const local = binary("==", ident("__brush.frame"), literal(frameName), span);
    parts.push(
      binary("and", ident("__brush.on"), binary("and", local, outBox, span), span),
    );
    if (linkXField) {
      const linked = binary(
        "and",
        binary("!=", ident("__brush.frame"), literal(frameName), span),
        binary("==", ident("__brush.xField"), literal(linkXField), span),
        span,
      );
      const outLink = binary(
        "or",
        binary("and", { kind: "unary", op: "not", expr: ident("__brush.mode"), span }, outRectX, span),
        binary("and", ident("__brush.mode"), outPoly, span),
        span,
      );
      parts.push(binary("and", ident("__brush.on"), binary("and", linked, outLink, span), span));
    }
    if (includeSelDim) {
      const hide = selHideExpr(seriesField, xField, frameName, span, loopVar);
      if (hide) parts.push(hide);
    }
  }
  if (!parts.length) return {};
  const dim = parts.reduce((acc, part) => binary("or", acc, part, span));
  return {
    opacity: binary("-", literal(1), binary("*", literal(0.72), dim, span), span),
  };
}

function markHighlightMotion(
  props: Record<string, Expr>,
  seriesField: string | null,
  span: { line: number; column: number },
  loopVar = "row",
): Record<string, Expr> {
  if (!seriesField || props.scale) return {};
  const hit = binary(
    "and",
    binary("!=", ident("__highlightGrp"), noneExpr(span), span),
    binary("==", ident(`${loopVar}.${seriesField}`), ident("__highlightGrp"), span),
    span,
  );
  return {
    scale: binary("+", literal(1), binary("*", literal(0.18), hit, span), span),
  };
}

function callExpr(callee: string, args: Expr[], span: { line: number; column: number }): Expr {
  return { kind: "call", callee, args, span };
}

const WORLD_SKIP_ROLES = new Set([
  "atmosphere",
  "backdrop",
  "grid",
  "axis",
  "legend",
  "legend-label",
  "chrome",
  "caption",
  "title",
  "subtitle",
  "label",
  "annotation",
  "hud",
  "panel",
  "plot",
]);

type WorldMarkBind = {
  node: Extract<SceneItem, { kind: "node" }>;
  target: string;
  frameName: string;
  loopVar: string;
  dataName: string | null;
  colorBy: string | null;
  xField: string | null;
  yField: string | null;
};

/**
 * Author marks with `frame:` share chart Runtime defaults: __tip / __hover /
 * __highlightGrp, linked __sel, and brush when x/y are data fields.
 * No new keyword. `interactive: false` or an author hover keeps control.
 */
function bindFramedWorldInteract(artifact: Artifact): void {
  if (!artifact.scene) return;
  const marks = collectFramedWorldMarks(artifact);
  if (!marks.length) return;
  const span = artifact.span;
  ensureInteractStates(artifact, span);
  ensureBrushState(artifact, span);
  ensureChartHud(artifact, span);

  const seenHover = new Set<string>();
  for (const mark of marks) {
    if (!chartInteractive(mark.node.props)) continue;
    const motion = {
      ...markInteractOpacity(
        mark.colorBy,
        mark.xField,
        mark.yField,
        mark.frameName,
        mark.xField,
        span,
        false,
        mark.loopVar,
      ),
      ...markHighlightMotion(mark.node.props, mark.colorBy, span, mark.loopVar),
      ...markSelVisible(mark.colorBy, mark.xField, mark.frameName, span, mark.loopVar),
    };
    if (!mark.node.props.opacity && motion.opacity) mark.node.props.opacity = motion.opacity;
    if (!mark.node.props.scale && motion.scale) mark.node.props.scale = motion.scale;
    if (!mark.node.props.visible && motion.visible) mark.node.props.visible = motion.visible;
    if (seenHover.has(mark.target)) continue;
    if (artifact.events.some((e) => e.type === "hover" && e.target === mark.target)) continue;
    seenHover.add(mark.target);
    const tipExpr = worldTipExpr(artifact, mark, span);
    const labelField = worldLabelField(artifact, mark);
    const hoverObj = objectExpr(
      [
        { key: "x", value: ident(mark.xField ?? "x") },
        { key: "y", value: ident(mark.yField ?? "y") },
        { key: "v", value: ident(labelField ?? mark.colorBy ?? mark.xField ?? "x") },
        { key: "grp", value: mark.colorBy ? ident(mark.colorBy) : noneExpr(span) },
      ],
      span,
    );
    artifact.events.push({
      type: "hover",
      target: mark.target,
      body: [
        ...hoverTipAssigns(tipExpr),
        assign(["__hover"], hoverObj),
        ...(mark.colorBy ? [assign(["__highlightGrp"], ident(mark.colorBy))] : []),
      ],
      span,
    });
  }

  const byFrame = new Map<string, WorldMarkBind[]>();
  for (const mark of marks) {
    const list = byFrame.get(mark.frameName) ?? [];
    list.push(mark);
    byFrame.set(mark.frameName, list);
  }
  for (const [frameName, group] of byFrame) {
    const live = group.filter((m) => chartInteractive(m.node.props));
    if (!live.length) continue;
    const brushable = live.find((m) => m.xField && m.yField && m.dataName);
    const frame = artifact.frames.find((f) => f.name === frameName);
    if (brushable && frame && !worldDragCoversFrame(artifact, frameName)) {
      insertWorldPlotBrushHit(artifact, frameName);
      ensureBrushOnPlot(
        artifact,
        `${frameName}_plotBg`,
        frameName,
        brushable.dataName!,
        brushable.xField!,
        brushable.xField!,
        brushable.yField!,
        brushable.colorBy,
        frame.props,
        span,
      );
    }
    const legendMark = live.find((m) => m.colorBy && m.dataName);
    if (
      legendMark &&
      !worldLegendSuppressed(artifact, frameName, live) &&
      !hasAuthorLegend(artifact, frameName)
    ) {
      const place = worldLegendPlace(artifact, frameName);
      const items = expandSeriesLegend(
        frameName,
        artifact,
        legendMark.dataName!,
        legendMark.colorBy!,
        frame?.props ?? {},
        place.place,
        span,
        place.chrome,
      );
      if (items.length) {
        artifact.scene.layers.push({
          name: `__${frameName}_legend`,
          span,
          props: {},
          items,
        });
      }
    }
  }
}

function collectFramedWorldMarks(artifact: Artifact): WorldMarkBind[] {
  const out: WorldMarkBind[] = [];
  for (const layer of artifact.scene?.layers ?? []) {
    if (layer.name.startsWith("__")) continue;
    walkWorldItems(layer.items, { loopVar: null, dataName: null }, out);
  }
  return out;
}

function walkWorldItems(
  items: SceneItem[],
  ctx: { loopVar: string | null; dataName: string | null },
  out: WorldMarkBind[],
): void {
  for (const item of items) {
    if (item.kind === "if") {
      walkWorldItems(item.body, ctx, out);
      continue;
    }
    if (item.kind === "for") {
      const dataName =
        item.source.kind === "ident" ? item.source.path[0] ?? null : ctx.dataName;
      walkWorldItems(item.body, { loopVar: item.item, dataName }, out);
      continue;
    }
    if (!ctx.loopVar) continue;
    if (item.name.startsWith("__")) continue;
    const frameName = stringProp(item.props, ["frame"]);
    if (!frameName) continue;
    const role = stringProp(item.props, ["role"]) ?? "";
    const colorBy = stringProp(item.props, ["colorBy", "group", "groupField"]);
    if (WORLD_SKIP_ROLES.has(role)) continue;
    if (role !== "mark" && !colorBy) continue;
    out.push({
      node: item,
      target: item.alias || item.name,
      frameName,
      loopVar: ctx.loopVar,
      dataName: ctx.dataName,
      colorBy,
      xField: fieldRefOf(item.props.x, ctx.loopVar),
      yField: fieldRefOf(item.props.y, ctx.loopVar),
    });
  }
}

function fieldRefOf(expr: Expr | undefined, loopVar: string): string | null {
  if (!expr || expr.kind !== "ident") return null;
  if (expr.path.length === 2 && expr.path[0] === loopVar) return expr.path[1] ?? null;
  if (expr.path.length === 1) return expr.path[0] ?? null;
  return null;
}

function worldRowFields(artifact: Artifact, dataName: string | null): Set<string> {
  const fields = new Set<string>();
  if (!dataName) return fields;
  const decl = artifact.data.find((d) => d.name === dataName);
  if (!decl || decl.value.kind !== "array") return fields;
  const row = decl.value.items.find((item) => item.kind === "object");
  if (!row || row.kind !== "object") return fields;
  for (const entry of row.entries) fields.add(entry.key);
  return fields;
}

function worldLabelField(artifact: Artifact, mark: WorldMarkBind): string | null {
  const fields = worldRowFields(artifact, mark.dataName);
  for (const key of ["id", "label", "name", "key"]) {
    if (fields.has(key)) return key;
  }
  return mark.colorBy;
}

function worldTipExpr(
  artifact: Artifact,
  mark: WorldMarkBind,
  span: { line: number; column: number },
): Expr {
  const label = worldLabelField(artifact, mark);
  const parts: Expr[] = [];
  if (label) parts.push(ident(label));
  if (mark.colorBy && mark.colorBy !== label) parts.push(ident(mark.colorBy));
  if (mark.xField && mark.yField) {
    parts.push(
      binary("+", binary("+", ident(mark.xField), literal(", "), span), ident(mark.yField), span),
    );
  }
  if (!parts.length) return literal("");
  return parts.reduce((acc, part) => binary("+", binary("+", acc, literal(" · "), span), part, span));
}

function worldLegendSuppressed(
  artifact: Artifact,
  frameName: string,
  marks: WorldMarkBind[],
): boolean {
  if (artifact.events.some((e) => e.target.startsWith(`${frameName}_leg_`))) return true;
  const frameNode = findAuthorNode(artifact, frameName);
  if (frameNode && legendPlacement(frameNode.props, marks[0]?.colorBy ?? "grp") === "off") return true;
  return marks.some((m) => legendPlacement(m.node.props, m.colorBy) === "off");
}

function hasAuthorLegend(artifact: Artifact, frameName: string): boolean {
  for (const layer of artifact.scene?.layers ?? []) {
    if (layer.name.startsWith("__")) continue;
    const nodes: Extract<SceneItem, { kind: "node" }>[] = [];
    walkWorldNodes(layer.items, nodes);
    for (const node of nodes) {
      if (node.name.startsWith(`${frameName}_leg`)) return true;
      const role = stringProp(node.props, ["role"]) ?? "";
      if (role === "legend" || role === "legend-label") return true;
    }
  }
  return false;
}

function walkWorldNodes(items: SceneItem[], out: Extract<SceneItem, { kind: "node" }>[]): void {
  for (const item of items) {
    if (item.kind === "node") out.push(item);
    else if (item.kind === "if" || item.kind === "for") walkWorldNodes(item.body, out);
  }
}

function findAuthorNode(
  artifact: Artifact,
  name: string,
): Extract<SceneItem, { kind: "node" }> | null {
  for (const layer of artifact.scene?.layers ?? []) {
    if (layer.name.startsWith("__")) continue;
    const nodes: Extract<SceneItem, { kind: "node" }>[] = [];
    walkWorldNodes(layer.items, nodes);
    const hit = nodes.find((n) => n.name === name);
    if (hit) return hit;
  }
  return null;
}

function nodeSceneBox(node: Extract<SceneItem, { kind: "node" }>): {
  x: number;
  y: number;
  w: number;
  h: number;
} | null {
  const x = numericLiteral(node.props.x);
  const y = numericLiteral(node.props.y);
  const w = numericLiteral(node.props.w ?? node.props.width);
  const h = numericLiteral(node.props.h ?? node.props.height);
  if (x === null || y === null || w === null || h === null) return null;
  if (!(w > 0) || !(h > 0)) return null;
  return { x, y, w, h };
}

function frameSceneBox(
  artifact: Artifact,
  frameName: string,
): { x: number; y: number; w: number; h: number } | null {
  const frame = artifact.frames.find((f) => f.name === frameName);
  if (!frame) return null;
  const xs = pairNums(frame.props.x ?? frame.props.areaX);
  const ys = pairNums(frame.props.y ?? frame.props.areaY);
  if (!xs || !ys) return null;
  return {
    x: Math.min(xs[0], xs[1]),
    y: Math.min(ys[0], ys[1]),
    w: Math.abs(xs[1] - xs[0]),
    h: Math.abs(ys[1] - ys[0]),
  };
}

function pairNums(expr: Expr | undefined): [number, number] | null {
  if (expr?.kind !== "array" || expr.items.length < 2) return null;
  const a = numericLiteral(expr.items[0]);
  const b = numericLiteral(expr.items[1]);
  if (a === null || b === null) return null;
  return [a, b];
}

function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function nodeIsDraggy(node: Extract<SceneItem, { kind: "node" }>): boolean {
  if (node.props.__chartBrush) return false;
  const raw = node.props.drag ?? node.props.draggable;
  if (!raw) return false;
  if (raw.kind === "boolean") return raw.value;
  if (raw.kind === "string") return raw.value !== "false" && raw.value !== "off";
  return true;
}

function worldDragCoversFrame(artifact: Artifact, frameName: string): boolean {
  const box = frameSceneBox(artifact, frameName);
  if (!box) return false;
  for (const layer of artifact.scene?.layers ?? []) {
    if (layer.name.startsWith("__")) continue;
    const nodes: Extract<SceneItem, { kind: "node" }>[] = [];
    walkWorldNodes(layer.items, nodes);
    for (const node of nodes) {
      if (node.name === frameName || node.name === `${frameName}_plotBg`) continue;
      if (!nodeIsDraggy(node) && !artifact.events.some((e) => e.type === "drag" && e.target === (node.alias || node.name))) {
        continue;
      }
      const other = nodeSceneBox(node);
      if (other && boxesOverlap(box, other)) return true;
    }
  }
  return false;
}

function insertWorldPlotBrushHit(artifact: Artifact, frameName: string): void {
  if (findAuthorNode(artifact, `${frameName}_plotBg`)) return;
  const box = frameSceneBox(artifact, frameName);
  if (!box) return;
  const hit = node(`${frameName}_plotBg`, {
    role: literal("plot"),
    x: literal(box.x),
    y: literal(box.y),
    w: literal(box.w),
    h: literal(box.h),
    drag: literal(true),
    __chartBrush: literal(true),
    fill: literal("#000000"),
    opacity: literal(0.001),
  });
  for (const layer of artifact.scene?.layers ?? []) {
    if (layer.name.startsWith("__")) continue;
    const idx = layer.items.findIndex((item) => item.kind === "node" && item.name === frameName);
    if (idx >= 0) {
      layer.items.splice(idx + 1, 0, hit);
      return;
    }
  }
  const host = artifact.scene?.layers.find((l) => !l.name.startsWith("__"));
  host?.items.unshift(hit);
}

function worldLegendPlace(
  artifact: Artifact,
  frameName: string,
): { place: "bottom" | "right" | "inside"; chrome: PaperChrome } {
  const box = frameSceneBox(artifact, frameName);
  const scene = sceneExtentOf(artifact);
  const dummy = emptyPaperChrome();
  if (!box) return { place: "right", chrome: dummy };
  let panelBottom: number | null = null;
  for (const layer of artifact.scene?.layers ?? []) {
    if (layer.name.startsWith("__")) continue;
    const nodes: Extract<SceneItem, { kind: "node" }>[] = [];
    walkWorldNodes(layer.items, nodes);
    for (const node of nodes) {
      if ((stringProp(node.props, ["role"]) ?? "") !== "panel") continue;
      const panel = nodeSceneBox(node);
      if (panel && boxesOverlap(panel, box)) {
        panelBottom = panel.y + panel.h;
      }
    }
  }
  const plotBottom = box.y + box.h;
  const gap = panelBottom !== null ? panelBottom - plotBottom : scene.h - plotBottom;
  const keys = 3;
  const step = Math.min(96, Math.max(56, box.w / Math.max(1, keys)));
  if (gap >= 14) {
    dummy.legendX = box.x + 8;
    dummy.legendY = plotBottom + Math.min(12, Math.max(8, gap * 0.45));
    dummy.legendStep = step;
    return { place: "bottom", chrome: dummy };
  }
  if (scene.w - (box.x + box.w) >= 48) {
    dummy.legendX = box.x + box.w + 10;
    dummy.legendY = box.y + 12;
    dummy.legendStep = 14;
    return { place: "right", chrome: dummy };
  }
  dummy.legendX = box.x + 12;
  dummy.legendY = plotBottom - 14;
  dummy.legendStep = 14;
  return { place: "inside", chrome: dummy };
}

function emptyPaperChrome(): PaperChrome {
  return {
    yTickX: 0,
    xTickY: 0,
    yTitleX: 0,
    xTitleY: 0,
    titleX: 0,
    titleY: 0,
    titleLineH: 14,
    axisLineH: 11,
    legendLineH: 10,
    titleLines: [],
    xTitleLines: [],
    yTitleLines: [],
    legendLines: [],
    legendX: 0,
    legendY: 0,
    legendStep: 72,
    cbarX: 0,
    cbarLines: [],
    cbarTitleLines: [],
    cbarTitleX: 0,
    cbarTitleY: 0,
    compact: false,
  };
}

function boundStateIsNumber(artifact: Artifact, bind: string): boolean {
  const name = bind.split(".")[0] ?? bind;
  const decl = artifact.states.find((s) => s.name === name);
  return decl?.value.kind === "number";
}

function stepDeltaOf(key: string): number | null {
  const k = key.trim().toLowerCase();
  if (k === "+" || k === "plus" || k === "in" || k === "zoomin" || k === "inc") return 1;
  if (k === "-" || k === "minus" || k === "out" || k === "zoomout" || k === "dec") return -1;
  return null;
}

function controlBindBody(
  artifact: Artifact,
  bind: string,
  key: string,
  props: Record<string, Expr>,
  span: { line: number; column: number },
): Statement[] {
  const path = bind.split(".");
  const delta = boundStateIsNumber(artifact, bind) ? stepDeltaOf(key) : null;
  if (delta === null) return [assign(path, literal(key))];
  const step = Math.abs(numProp(props, "step", 0.1)) * delta;
  let next: Expr = binary("+", ident(bind), literal(step), span);
  const lo = props.min ?? props.low;
  const hi = props.max ?? props.high;
  if (lo && hi) next = callExpr("clamp", [next, lo, hi], span);
  else if (lo) next = callExpr("max", [next, lo], span);
  else if (hi) next = callExpr("min", [next, hi], span);
  return [assign(path, next)];
}

/**
 * Plot frames paint their own title band and numeric stepper chips.
 * Reuses board `title` / `controls` / `bind` — not new keywords.
 */
function paintPlotFrameChrome(artifact: Artifact): void {
  if (!artifact.scene) return;
  const span = artifact.span;
  for (const layer of artifact.scene.layers) {
    if (layer.name.startsWith("__")) continue;
    const nodes: Extract<SceneItem, { kind: "node" }>[] = [];
    walkWorldNodes(layer.items, nodes);
    for (const plot of nodes) {
      if ((stringProp(plot.props, ["role"]) ?? "") !== "plot") continue;
      const titleExpr = copyExpr(plot.props, ["title"]);
      const keys = controlKeysFromProps(plot.props);
      const bind = stringProp(plot.props, ["bind", "controlBind"]);
      if (!titleExpr && !keys.length) continue;
      const box = nodeSceneBox(plot) ?? frameSceneBox(artifact, plot.name);
      if (!box) continue;
      let panel: { x: number; y: number; w: number; h: number } | null = null;
      for (const other of nodes) {
        if ((stringProp(other.props, ["role"]) ?? "") !== "panel") continue;
        const pb = nodeSceneBox(other);
        if (pb && boxesOverlap(pb, box)) panel = pb;
      }
      const bandTop = panel ? panel.y : Math.max(0, box.y - 28);
      const bandH = Math.max(20, box.y - bandTop);
      const items: SceneItem[] = [];
      if (titleExpr && !authorTitleNear(artifact, box, titleExpr)) {
        items.push(
          node(`${plot.name}_title`, {
            role: literal("title"),
            x: literal(box.x),
            y: literal(bandTop + Math.min(16, bandH * 0.45)),
            w: literal(Math.max(40, box.w - (keys.length ? 88 : 0))),
            text: titleExpr,
          }),
        );
      }
      if (keys.length && bind) {
        const hostRight = panel ? panel.x + panel.w : box.x + box.w;
        const chipH = Math.min(30, Math.max(22, bandH - 6));
        const chipY = bandTop + Math.max(4, (bandH - chipH) / 2);
        let cursorX = hostRight - 4;
        const gap = 8;
        for (let i = keys.length - 1; i >= 0; i--) {
          const key = keys[i]!;
          const chipW = Math.min(36, measureChipWidth(key));
          cursorX -= chipW;
          const chipName = `${plot.name}_ctl_${i}`;
          const lblName = `${plot.name}_ctlLbl_${i}`;
          items.push(
            node(chipName, {
              role: literal("chrome"),
              x: literal(cursorX),
              y: literal(chipY),
              w: literal(chipW),
              h: literal(chipH),
              radius: literal(8),
            }),
            node(lblName, {
              role: literal("label"),
              x: literal(cursorX + chipW / 2),
              y: literal(chipY + chipH * 0.7),
              text: literal(key),
              font: literal(16),
              align: literal("center"),
            }),
          );
          const body = controlBindBody(artifact, bind, key, plot.props, span);
          for (const target of [chipName, lblName]) {
            if (!artifact.events.some((e) => e.type === "click" && e.target === target)) {
              artifact.events.push({ type: "click", target, body, span });
            }
          }
          cursorX -= gap;
        }
      }
      if (items.length) {
        artifact.scene.layers.push({
          name: `__${plot.name}_chrome`,
          span,
          props: {},
          items,
        });
      }
    }
  }
}

function authorTitleNear(
  artifact: Artifact,
  plot: { x: number; y: number; w: number; h: number },
  titleExpr: Expr,
): boolean {
  const want = titleExpr.kind === "string" ? titleExpr.value : null;
  for (const layer of artifact.scene?.layers ?? []) {
    if (layer.name.startsWith("__")) continue;
    const nodes: Extract<SceneItem, { kind: "node" }>[] = [];
    walkWorldNodes(layer.items, nodes);
    for (const node of nodes) {
      if ((stringProp(node.props, ["role"]) ?? "") !== "title") continue;
      const text = stringProp(node.props, ["text"]);
      if (want && text && text !== want) continue;
      const y = numericLiteral(node.props.y);
      const x = numericLiteral(node.props.x);
      if (y === null || x === null) continue;
      if (Math.abs(y - plot.y) < 48 && x >= plot.x - 24 && x <= plot.x + plot.w + 24) return true;
    }
  }
  return false;
}

function hoverTipAssigns(tipExpr: Expr): Statement[] {
  return [
    assign(["__tip"], tipExpr),
    assign(["__tipX"], ident("__event.x")),
    assign(["__tipY"], ident("__event.y")),
  ];
}

function ensureInteractStates(artifact: Artifact, span: { line: number; column: number }): void {
  if (!artifact.states.some((s) => s.name === "__tip")) {
    artifact.states.push({ name: "__tip", value: literal(""), span });
  }
  if (!artifact.states.some((s) => s.name === "__tipX")) {
    artifact.states.push({ name: "__tipX", value: literal(0), span });
  }
  if (!artifact.states.some((s) => s.name === "__tipY")) {
    artifact.states.push({ name: "__tipY", value: literal(0), span });
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
}

function ensureBrushState(artifact: Artifact, span: { line: number; column: number }): void {
  if (artifact.states.some((s) => s.name === "__brush")) return;
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
        { key: "pts", value: { kind: "array", items: [], span } },
        { key: "dpts", value: { kind: "array", items: [], span } },
        { key: "len", value: literal(0) },
        { key: "lx", value: literal(0) },
        { key: "ly", value: literal(0) },
        { key: "mode", value: literal(0) },
      ],
      span,
    ),
    span,
  });
}

function chartTipYExpr(
  span: { line: number; column: number },
  oy: number,
  loScene: number,
  hiScene: number,
  pageH: number,
  topReserve: number,
  bottomReserve: number,
): Expr {
  const raw = binary("-", ident("__tipY"), literal(oy), span);
  if (!(pageH > 0)) {
    return callExpr("clamp", [raw, literal(loScene), literal(hiScene)], span);
  }
  const pageIndex = callExpr("floor", [binary("/", ident("__tipY"), literal(pageH), span)], span);
  const pageTop = binary("*", pageIndex, literal(pageH), span);
  const lo = callExpr(
    "max",
    [literal(loScene), binary("+", pageTop, literal(topReserve), span)],
    span,
  );
  const hi = callExpr(
    "min",
    [
      literal(hiScene),
      binary("-", binary("+", pageTop, literal(pageH), span), literal(bottomReserve), span),
    ],
    span,
  );
  return callExpr("clamp", [raw, lo, hi], span);
}

function ensureChartHud(artifact: Artifact, span: { line: number; column: number }): void {
  if (!artifact.scene) return;
  if (artifact.scene.layers.some((l) => l.name === "__chart_hud")) return;
  const { w: width, h: height } = sceneExtentOf(artifact);
  const compact = isCompactScene(artifact);
  const ox = compact ? 3 : 12;
  const oy = compact ? 4 : 14;
  const font = compact ? 8 : 11;
  const pad = compact ? 2 : 8;
  const unit = sceneUnitOf(artifact);
  const page = parsePage(stringProp(artifact.scene.props, ["page"]));
  const pageH = page ? (unit === "mm" || unit === "pt" ? page.h : mmToPx(page.h)) : 0;
  const reserves = pageH > 0 ? figurePageReserves(unit) : { pad: 0, top: 0, bottom: 0 };
  const hudItems: SceneItem[] = [
    node("chartTip", {
      role: literal("hud"),
      x: callExpr(
        "clamp",
        [
          binary("+", ident("__tipX"), literal(ox), span),
          literal(pad),
          literal(Math.max(pad, width - pad)),
        ],
        span,
      ),
      y: chartTipYExpr(
        span,
        oy,
        pad + font,
        Math.max(pad + font, height - pad),
        pageH,
        Math.max(pad + font, reserves.top),
        Math.max(pad, reserves.bottom),
      ),
      text: ident("__tip"),
      font: literal(font),
      align: literal("left"),
      visible: ident("__tip"),
    }),
  ];
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
      opacity: binary(
        "*",
        ident("__brush.on"),
        binary("*", binary("-", literal(1), ident("__brush.mode"), span), literal(0.18), span),
        span,
      ),
    }),
    node("brushPath", {
      role: literal("chrome"),
      d: callExpr("pathd", [ident("__brush.pts")], span),
      fill: literal("#0072B2"),
      stroke: literal("#0072B2"),
      strokeWidth: literal(1.25),
      opacity: binary(
        "*",
        ident("__brush.on"),
        binary("*", ident("__brush.mode"), literal(0.2), span),
        span,
      ),
    }),
  );
  artifact.scene.layers.push({
    name: "__chart_hud",
    span,
    props: {},
    items: hudItems,
  });
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
  ensureInteractStates(artifact, span);
  ensureBrushState(artifact, span);
  ensureChartHud(artifact, span);
  if (!artifact.scene) return;

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
        ...hoverTipAssigns(tipExpr),
        assign(["__hover"], hoverObj),
        ...(seriesField ? [assign(["__highlightGrp"], ident(seriesField))] : []),
      ],
      span,
    });
  }

  ensureBrushOnPlot(
    artifact,
    `${frameName}_plotBg`,
    frameName,
    dataName,
    xField,
    markXField,
    markYField,
    seriesField,
    geom,
    span,
  );
}

function ensureBrushOnPlot(
  artifact: Artifact,
  plotName: string,
  frameName: string,
  dataName: string,
  xField: string,
  markXField: string,
  markYField: string,
  seriesField: string | null,
  geom: Record<string, Expr>,
  span: { line: number; column: number },
): void {
  if (artifact.events.some((e) => e.type === "dragstart" && e.target === plotName)) return;
  const invertX = invertSceneXExpr(ident("__event.x"), geom, span);
  const invertY = invertSceneYExpr(ident("__event.y"), geom, span);
  const eventPt = objectExpr(
    [
      { key: "x", value: ident("__event.x") },
      { key: "y", value: ident("__event.y") },
    ],
    span,
  );
  const dataPt = objectExpr(
    [
      { key: "x", value: invertSceneXExpr(ident("__event.x"), geom, span) },
      { key: "y", value: invertSceneYExpr(ident("__event.y"), geom, span) },
    ],
    span,
  );
  const onePt = (pt: Expr): Expr => ({ kind: "array", items: [pt], span });
  const step = callExpr(
    "sqrt",
    [
      binary(
        "+",
        binary("*", binary("-", ident("__event.x"), ident("__brush.lx"), span), binary("-", ident("__event.x"), ident("__brush.lx"), span), span),
        binary("*", binary("-", ident("__event.y"), ident("__brush.ly"), span), binary("-", ident("__event.y"), ident("__brush.ly"), span), span),
        span,
      ),
    ],
    span,
  );
  const boxManhattan = binary(
    "+",
    callExpr("abs", [binary("-", ident("__brush.x1"), ident("__brush.x0"), span)], span),
    callExpr("abs", [binary("-", ident("__brush.y1"), ident("__brush.y0"), span)], span),
    span,
  );
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
      assign(["__brush", "pts"], onePt(eventPt)),
      assign(["__brush", "dpts"], onePt(objectExpr([{ key: "x", value: invertX }, { key: "y", value: invertY }], span))),
      assign(["__brush", "len"], literal(0)),
      assign(["__brush", "lx"], ident("__event.x")),
      assign(["__brush", "ly"], ident("__event.y")),
      assign(["__brush", "mode"], literal(0)),
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
      {
        kind: "if",
        cond: binary(">", step, literal(3), span),
        body: [
          assign(["__brush", "pts"], binary("+", ident("__brush.pts"), onePt(eventPt), span)),
          assign(["__brush", "dpts"], binary("+", ident("__brush.dpts"), onePt(dataPt), span)),
          assign(["__brush", "len"], binary("+", ident("__brush.len"), step, span)),
          assign(["__brush", "lx"], ident("__event.x")),
          assign(["__brush", "ly"], ident("__event.y")),
        ],
        span,
      },
      assign(
        ["__brush", "mode"],
        binary(
          ">",
          ident("__brush.len"),
          binary("*", literal(1.6), boxManhattan, span),
          span,
        ),
      ),
      ...collectSelStmts(dataName, markXField, markYField, seriesField, span),
    ],
    span,
  });
  const tinyX = binary(
    "<",
    callExpr("abs", [binary("-", ident("__brush.x1"), ident("__brush.x0"), span)], span),
    literal(4),
    span,
  );
  const tinyY = binary(
    "<",
    callExpr("abs", [binary("-", ident("__brush.y1"), ident("__brush.y0"), span)], span),
    literal(4),
    span,
  );
  artifact.events.push({
    type: "dragend",
    target: plotName,
    body: [
      {
        kind: "if",
        cond: binary("and", tinyX, tinyY, span),
        body: [
          assign(["__brush", "on"], literal(0)),
          assign(["__brush", "mode"], literal(0)),
          assign(["__brush", "pts"], { kind: "array", items: [], span }),
          assign(["__brush", "dpts"], { kind: "array", items: [], span }),
          assign(["__brush", "len"], literal(0)),
          assign(["__sel", "keys"], { kind: "array", items: [], span }),
          assign(["__sel", "n"], literal(0)),
          assign(["__sel", "xField"], literal("")),
          assign(["__highlightGrp"], noneExpr(span)),
        ],
        span,
      },
    ],
    span,
  });
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
  const inRectX = binary(
    "and",
    binary(">=", ident(`row.${xField}`), loX, span),
    binary("<=", ident(`row.${xField}`), hiX, span),
    span,
  );
  const inRectY = binary(
    "and",
    binary(">=", ident(`row.${yField}`), loY, span),
    binary("<=", ident(`row.${yField}`), hiY, span),
    span,
  );
  const inPoly = callExpr(
    "inside",
    [ident(`row.${xField}`), ident(`row.${yField}`), ident("__brush.dpts")],
    span,
  );
  const inX = binary(
    "or",
    binary("and", { kind: "unary", op: "not", expr: ident("__brush.mode"), span }, inRectX, span),
    binary("and", ident("__brush.mode"), inPoly, span),
    span,
  );
  const inY = binary(
    "or",
    binary("and", { kind: "unary", op: "not", expr: ident("__brush.mode"), span }, inRectY, span),
    ident("__brush.mode"),
    span,
  );
  const key = seriesField ? ident(`row.${seriesField}`) : ident(`row.${xField}`);
  const plus = binary(
    "+",
    ident("__sel.keys"),
    { kind: "array", items: seriesField ? [key, ident(`row.${xField}`)] : [key], span },
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
