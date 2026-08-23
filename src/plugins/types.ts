import type { Artifact, Expr } from "../ast.js";

export type WidgetExpandContext = {
  artifact: Artifact;
  name: string;
  props: Record<string, Expr>;
  index: number;
};

export type WidgetPlugin = {
  name: string;
  expand(ctx: WidgetExpandContext): void;
};
