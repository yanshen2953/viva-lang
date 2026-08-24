/** Agent review / selection protocol (Photoshop-inspired). */

export type ScenePoint = { x: number; y: number };

export type SelectionTool = "rect" | "point" | "lasso" | "bezier";

/** Photoshop-like combine modes for multi-select. */
export type SelectionCombine = "replace" | "add" | "subtract" | "intersect";

export type SelectionRegion =
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "point"; x: number; y: number }
  | { kind: "lasso"; points: ScenePoint[] }
  | { kind: "bezier"; points: ScenePoint[] };

export type SelectedNode = {
  id: string;
  name: string;
  group?: string;
  layerId: string;
  layerName: string;
  bbox: { x: number; y: number; w: number; h: number };
};

/**
 * Rich feedback kinds — not only free-text notes.
 * Agents use these to decide repair strategy.
 */
export type FeedbackKind =
  | "note" // general annotation
  | "issue" // something is wrong here
  | "fix" // concrete repair instruction
  | "question" // ask the agent
  | "keep" // do not change this region
  | "constraint" // hard requirement
  | "data" // wrong data / mapping
  | "style" // color / typography / stroke
  | "layout" // position / size / alignment
  | "interaction" // events / drag / tick behavior
  | "label"; // text content wrong

export type FeedbackSeverity = "info" | "warn" | "error";

export type ReviewFeedback = {
  id: string;
  kind: FeedbackKind;
  text: string;
  severity: FeedbackSeverity;
  /** Bound node ids (may be empty for region-only marks). */
  selectionIds: string[];
  region?: SelectionRegion;
  anchor?: ScenePoint;
  tags?: string[];
  createdAt: number;
};

export type ReviewSnapshot = {
  tool: SelectionTool;
  combine: SelectionCombine;
  selection: SelectedNode[];
  regions: SelectionRegion[];
  feedback: ReviewFeedback[];
  /** Full scene SVG (vector-precise, with data-viva-id). */
  sceneSvg: string;
  /** Subset SVG: selected nodes + annotation overlays. */
  selectionSvg: string;
  /** Compact JSON for tools. */
  payload: {
    ids: string[];
    names: string[];
    feedback: ReviewFeedback[];
  };
  /** Natural-language brief for LLM repair turns. */
  agentBrief: string;
};
