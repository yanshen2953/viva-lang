import { ident, literal, type Artifact, type Expr, type LayerDecl, type SceneItem, type Statement } from "./ast.js";

export function expandWidgets(artifact: Artifact): Artifact {
  const next = structuredClone(artifact);
  if (!next.scene) {
    next.scene = { props: {}, layers: [], span: artifact.span };
  }

  for (const widget of next.widgets) {
    if (widget.name === "timeline") {
      expandTimeline(next, widget.props);
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
        w: {
          kind: "binary",
          op: "*",
          left: literal(720),
          right: {
            kind: "binary",
            op: "/",
            left: {
              kind: "binary",
              op: "-",
              left: ident(bindName),
              right: from,
            },
            right: {
              kind: "binary",
              op: "-",
              left: to,
              right: from,
            },
          },
          span,
        },
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
        {
          kind: "binary",
          op: "+",
          left: from,
          right: {
            kind: "binary",
            op: "*",
            left: {
              kind: "binary",
              op: "-",
              left: to,
              right: from,
            },
            right: ident("__event.t"),
          },
          span,
        },
      ),
    ],
    span,
  });
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
