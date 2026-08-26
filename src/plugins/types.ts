import type { Artifact, Expr } from "../ast.js";

export type WidgetExpandContext = {
  artifact: Artifact;
  name: string;
  props: Record<string, Expr>;
  index: number;
};

export type WidgetPlugin = {
  name: string;
  /** Expand-phase dependencies (widget names). Missing names are ignored. */
  after?: string[];
  /**
   * Compile hooks allowed to mutate this plugin's layers/frames.
   * Empty (default) means none. `["*"]` allows every registered hook.
   */
  allowHooks?: string[];
  expand(ctx: WidgetExpandContext): void;
};

/** Post-expand compile phase. `after` is a declared dependency, not a widget name. */
export type CompileHook = {
  name: string;
  after?: string[];
  run: (artifact: Artifact) => void;
};
