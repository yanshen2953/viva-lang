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

/** Post-expand compile phase. `after` is a declared dependency, not a widget name. */
export type CompileHook = {
  name: string;
  after?: string[];
  run: (artifact: Artifact) => void;
};
