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

  const color = props.color ?? props.fill ?? literal("#38bdf8");
  const stroke = props.stroke ?? color;
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

  const axisLayer: LayerDecl = {
    name: `__${frameName}_axes`,
    span,
    props: {},
    items: [
      node(`${frameName}_xAxis`, {
        frame: literal(frameName),
        x1: xlimLow(props),
        y1: ylimLow(props),
        x2: xlimHigh(props),
        y2: ylimLow(props),
        stroke: literal("#64748b"),
        strokeWidth: literal(1.5),
      }),
      node(`${frameName}_yAxis`, {
        frame: literal(frameName),
        x1: xlimLow(props),
        y1: ylimLow(props),
        x2: xlimLow(props),
        y2: ylimHigh(props),
        stroke: literal("#64748b"),
        strokeWidth: literal(1.5),
      }),
      node(`${frameName}_title`, {
        x: titleX,
        y: titleYExpr,
        text: literal(title),
        font: literal(16),
        fill: literal("#e2e8f0"),
      }),
    ],
  };

  const marks: SceneItem[] = [];
  if (kind === "chart.scatter") {
    marks.push({
      kind: "for",
      item: "row",
      source: ident(dataName),
      span,
      body: [
        node("mark", {
          frame: literal(frameName),
          x: ident(`row.${resolvedXField}`),
          y: ident(`row.${resolvedYField}`),
          r: props.r ?? literal(3.5),
          fill: color,
          hoverFill: props.hoverFill ?? literal("#f59e0b"),
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
          frame: literal(frameName),
          x: ident(`row.${resolvedXField}`),
          y: ident(`row.${resolvedYField}`),
          r: props.r ?? literal(2.5),
          fill: color,
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
        stroke,
        span,
      ),
    );
  } else if (kind === "chart.bar") {
    marks.push({
      kind: "for",
      item: "row",
      source: ident(dataName),
      span,
      body: [
        node("bar", {
          frame: literal(frameName),
          x: ident(`row.${resolvedXField}`),
          y: ident(`row.${resolvedYField}`),
          w: props.barWidth ?? literal(0.6),
          h: ident(`row.${resolvedYField}`),
          fill: color,
          radius: literal(2),
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
  stroke: Expr,
  _span: unknown,
): SceneItem[] {
  const decl = artifact.data.find((d) => d.name === dataName);
  if (!decl || decl.value.kind !== "array") return [];
  const items: SceneItem[] = [];
  const rows = decl.value.items;
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
        frame: literal(frameName),
        x1: ax,
        y1: ay,
        x2: bx,
        y2: by,
        stroke,
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
