import type { Expr, Statement } from "./ast.js";

export type SceneNodeIR =
  | {
      kind: "node";
      id: string;
      name: string;
      group?: string;
      props: Record<string, Expr>;
    }
  | {
      kind: "for";
      id: string;
      item: string;
      source: Expr;
      body: SceneNodeIR[];
    }
  | {
      kind: "if";
      id: string;
      cond: Expr;
      body: SceneNodeIR[];
    };

export type LayerIR = {
  id: string;
  name: string;
  props: Record<string, Expr>;
  items: SceneNodeIR[];
};

export type SceneIR = {
  props: Record<string, Expr>;
  layers: LayerIR[];
};

export type FrameIR = {
  name: string;
  props: Record<string, Expr>;
};

export type VisualIR = {
  name: string;
  scene: SceneIR;
  frames: FrameIR[];
  state: Record<string, unknown>;
  data: Record<string, unknown>;
  events: { type: string; target: string; body: Statement[] }[];
  rules: { cond: Expr; body: Statement[] }[];
  binds: { target: string[]; source: Expr }[];
  ticks: { fps: number; body: Statement[] }[];
  animates: { name: string; props: Record<string, unknown> }[];
  meta?: import("./style/types.js").StyleMeta;
  /** layout.board play clock. Plugin property, not a keyword. */
  timeline?: import("./timeline/clock.js").TimelineSpec;
};
