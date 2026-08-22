export type {
  ScenePoint,
  SelectionTool,
  SelectionCombine,
  SelectionRegion,
  SelectedNode,
  FeedbackKind,
  FeedbackSeverity,
  ReviewFeedback,
  ReviewSnapshot,
} from "./types.js";

export {
  bboxIntersects,
  pointInRect,
  pointInPolygon,
  sampleBezier,
  regionHitsNode,
  normalizeRect,
  combineSelection,
  invertSelection,
} from "./geometry.js";

export { buildAgentBrief } from "./agent-brief.js";
export { listSelectableNodes } from "./nodes.js";
export {
  createReviewController,
  runtimeReviewView,
  type ReviewController,
} from "./controller.js";
