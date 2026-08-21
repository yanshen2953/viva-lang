import type { Span } from "./diagnostics.js";

export type Expr =
  | { kind: "number"; value: number; span: Span }
  | { kind: "string"; value: string; span: Span }
  | { kind: "boolean"; value: boolean; span: Span }
  | { kind: "none"; span: Span }
  | { kind: "ident"; path: string[]; span: Span }
  | { kind: "array"; items: Expr[]; span: Span }
  | { kind: "object"; entries: { key: string; value: Expr }[]; span: Span }
  | { kind: "unary"; op: "not" | "-"; expr: Expr; span: Span }
  | { kind: "binary"; op: BinaryOp; left: Expr; right: Expr; span: Span };

export type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "=="
  | "!="
  | "<"
  | ">"
  | "<="
  | ">="
  | "and"
  | "or";

export type Statement =
  | { kind: "assign"; target: string[]; value: Expr; span: Span }
  | { kind: "if"; cond: Expr; body: Statement[]; span: Span }
  | { kind: "for"; item: string; source: Expr; body: Statement[]; span: Span };

export type SceneItem =
  | {
      kind: "node";
      name: string;
      alias?: string;
      props: Record<string, Expr>;
      span: Span;
    }
  | {
      kind: "for";
      item: string;
      source: Expr;
      body: SceneItem[];
      span: Span;
    }
  | { kind: "if"; cond: Expr; body: SceneItem[]; span: Span };

export type LayerDecl = {
  name: string;
  props: Record<string, Expr>;
  items: SceneItem[];
  span: Span;
};

export type SceneDecl = {
  props: Record<string, Expr>;
  layers: LayerDecl[];
  span: Span;
};

export type FrameDecl = {
  name: string;
  props: Record<string, Expr>;
  span: Span;
};

export type Artifact = {
  name: string;
  states: { name: string; value: Expr; span: Span }[];
  data: { name: string; value: Expr; span: Span }[];
  entities: { name: string; props: Record<string, Expr>; span: Span }[];
  frames: FrameDecl[];
  scene: SceneDecl | null;
  events: {
    type: string;
    target: string;
    body: Statement[];
    span: Span;
  }[];
  rules: { cond: Expr; body: Statement[]; span: Span }[];
  binds: { target: string[]; source: Expr; span: Span }[];
  ticks: { fps: number; body: Statement[]; span: Span }[];
  animates: { name: string; props: Record<string, Expr>; span: Span }[];
  widgets: { name: string; props: Record<string, Expr>; span: Span }[];
  functions: {
    name: string;
    params: string[];
    body: Statement[];
    span: Span;
  }[];
  span: Span;
};

export function literal(value: unknown, span: Span = { line: 1, column: 1 }): Expr {
  if (value === null || value === undefined) return { kind: "none", span };
  if (typeof value === "number") return { kind: "number", value, span };
  if (typeof value === "string") return { kind: "string", value, span };
  if (typeof value === "boolean") return { kind: "boolean", value, span };
  if (Array.isArray(value)) {
    return {
      kind: "array",
      items: value.map((item) => literal(item, span)),
      span,
    };
  }
  return {
    kind: "object",
    entries: Object.entries(value as Record<string, unknown>).map(([key, item]) => ({
      key,
      value: literal(item, span),
    })),
    span,
  };
}

export function ident(path: string, span: Span = { line: 1, column: 1 }): Expr {
  return { kind: "ident", path: path.split("."), span };
}

export function emptyArtifact(name: string, span: Span): Artifact {
  return {
    name,
    states: [],
    data: [],
    entities: [],
    frames: [],
    scene: null,
    events: [],
    rules: [],
    binds: [],
    ticks: [],
    animates: [],
    widgets: [],
    functions: [],
    span,
  };
}

export function binary(
  op: BinaryOp,
  left: Expr,
  right: Expr,
  span: Span = { line: 1, column: 1 },
): Expr {
  return { kind: "binary", op, left, right, span };
}
