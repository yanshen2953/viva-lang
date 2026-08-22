import type { Runtime } from "../runtime.js";
import { buildAgentBrief } from "./agent-brief.js";
import {
  combineSelection,
  invertSelection,
  normalizeRect,
  regionHitsNode,
  sampleBezier,
} from "./geometry.js";
import { listSelectableNodes } from "./nodes.js";
import type {
  FeedbackKind,
  FeedbackSeverity,
  ReviewFeedback,
  ReviewSnapshot,
  ScenePoint,
  SelectedNode,
  SelectionCombine,
  SelectionRegion,
  SelectionTool,
} from "./types.js";

export type ReviewController = {
  setTool(tool: SelectionTool): void;
  setCombine(mode: SelectionCombine): void;
  getTool(): SelectionTool;
  getCombine(): SelectionCombine;
  getSelection(): SelectedNode[];
  clearSelection(): void;
  invertSelection(): void;
  selectByRegion(region: SelectionRegion, combine?: SelectionCombine): SelectedNode[];
  selectByIds(ids: string[], combine?: SelectionCombine): SelectedNode[];
  addFeedback(input: {
    kind: FeedbackKind;
    text: string;
    severity?: FeedbackSeverity;
    tags?: string[];
    region?: SelectionRegion;
    anchor?: ScenePoint;
    /** If omitted, bind to current selection. */
    selectionIds?: string[];
  }): ReviewFeedback;
  listFeedback(): ReviewFeedback[];
  clearFeedback(): void;
  snapshot(): ReviewSnapshot;
  /** Attach pointer handlers for interactive tools (browser). */
  attach(): void;
  detach(): void;
  destroy(): void;
};

type RuntimeView = Pick<Runtime, "exportSvg"> & {
  getSvg(): SVGSVGElement | null;
  hitTest(clientX: number, clientY: number): SelectedNode | null;
  scenePoint(clientX: number, clientY: number): ScenePoint;
  listNodes(): SelectedNode[];
};

/**
 * Photoshop-inspired selection + rich feedback for agent repair loops.
 */
export function createReviewController(opts: {
  runtime: RuntimeView;
  getSource?: () => string;
  onChange?: (snap: ReviewSnapshot) => void;
}): ReviewController {
  let tool: SelectionTool = "rect";
  let combine: SelectionCombine = "replace";
  let selection: SelectedNode[] = [];
  let regions: SelectionRegion[] = [];
  let feedback: ReviewFeedback[] = [];
  let feedbackSeq = 0;
  let attached = false;

  let drawing = false;
  let start: ScenePoint | null = null;
  let draftPoints: ScenePoint[] = [];
  let gestureCombine: SelectionCombine = "replace";
  let overlay: SVGGElement | null = null;
  let draftEl: SVGElement | null = null;

  const notify = () => opts.onChange?.(snapshot());

  const allNodes = () => opts.runtime.listNodes();

  const applyRegion = (region: SelectionRegion, mode = combine) => {
    regions = mode === "replace" ? [region] : [...regions, region];
    const hits = allNodes().filter((n) => regionHitsNode(region, n));
    selection = combineSelection(selection, hits, mode);
    paintOverlay();
    notify();
    return selection;
  };

  function ensureOverlay(): SVGGElement | null {
    const svg = opts.runtime.getSvg();
    if (!svg) return null;
    let g = svg.querySelector(":scope > g[data-viva-review]") as SVGGElement | null;
    if (!g) {
      g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("data-viva-review", "1");
      g.style.pointerEvents = "none";
      svg.appendChild(g);
    }
    overlay = g;
    return g;
  }

  function paintOverlay(): void {
    const g = ensureOverlay();
    if (!g) return;
    const svg = opts.runtime.getSvg();
    // Keep review overlay above scene layers every paint.
    if (svg && g.parentNode === svg) svg.appendChild(g);
    g.innerHTML = "";
    for (const n of selection) {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(n.bbox.x));
      rect.setAttribute("y", String(n.bbox.y));
      rect.setAttribute("width", String(Math.max(n.bbox.w, 1)));
      rect.setAttribute("height", String(Math.max(n.bbox.h, 1)));
      rect.setAttribute("fill", "rgba(56,189,248,0.22)");
      rect.setAttribute("stroke", "#38bdf8");
      rect.setAttribute("stroke-width", "2.5");
      rect.setAttribute("stroke-dasharray", "6 4");
      rect.setAttribute("vector-effect", "non-scaling-stroke");
      g.appendChild(rect);
    }
    for (const f of feedback) {
      if (!f.anchor) continue;
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", String(f.anchor.x));
      t.setAttribute("y", String(f.anchor.y));
      t.setAttribute("fill", severityColor(f.severity));
      t.setAttribute("font-size", "13");
      t.setAttribute("font-weight", "600");
      t.textContent = `${f.kind}: ${f.text.slice(0, 40)}`;
      g.appendChild(t);
    }
  }

  function selectionSvg(): string {
    const scene = opts.runtime.exportSvg() || "";
    if (!selection.length && !feedback.length) return scene;
    // Prefer subset: wrap selected element clones when DOM available
    const svg = opts.runtime.getSvg();
    if (!svg) return scene;
    const vb = svg.getAttribute("viewBox") ?? "0 0 880 480";
    const parts: string[] = [];
    for (const n of selection) {
      const el = svg.querySelector(`[data-viva-id="${cssSel(n.id)}"]`);
      if (el) parts.push(el.outerHTML);
    }
    const review = svg.querySelector(":scope > g[data-viva-review]");
    if (review) parts.push(review.outerHTML);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">\n${parts.join("\n")}\n</svg>`;
  }

  function snapshot(): ReviewSnapshot {
    const sceneSvg = opts.runtime.exportSvg() || "";
    const selSvg = selectionSvg();
    const agentBrief = buildAgentBrief({
      selection,
      feedback,
      sourceExcerpt: opts.getSource?.(),
    });
    return {
      tool,
      combine,
      selection: [...selection],
      regions: [...regions],
      feedback: [...feedback],
      sceneSvg,
      selectionSvg: selSvg,
      payload: {
        ids: selection.map((n) => n.id),
        names: selection.map((n) => n.name),
        feedback: [...feedback],
      },
      agentBrief,
    };
  }

  const onPointerDown = (event: PointerEvent) => {
    const svg = opts.runtime.getSvg();
    if (!svg || event.button !== 0) return;
    // Shift / Alt apply for this gesture only (Photoshop-ish).
    gestureCombine = event.shiftKey ? "add" : event.altKey ? "subtract" : combine;

    const p = opts.runtime.scenePoint(event.clientX, event.clientY);
    drawing = true;
    start = p;
    draftPoints = [p];
    svg.setPointerCapture(event.pointerId);

    if (tool === "point") {
      const hit = opts.runtime.hitTest(event.clientX, event.clientY);
      if (hit) selection = combineSelection(selection, [hit], gestureCombine);
      else applyRegion({ kind: "point", ...p }, gestureCombine);
      drawing = false;
      paintOverlay();
      notify();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drawing || !start) return;
    const p = opts.runtime.scenePoint(event.clientX, event.clientY);
    if (tool === "lasso" || tool === "bezier") {
      draftPoints.push(p);
    } else {
      draftPoints = [start, p];
    }
    paintDraft();
    event.preventDefault();
    event.stopPropagation();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!drawing || !start) return;
    const p = opts.runtime.scenePoint(event.clientX, event.clientY);
    drawing = false;
    let region: SelectionRegion | null = null;
    if (tool === "rect") {
      const w = p.x - start.x;
      const h = p.y - start.y;
      // Ignore click-jitter so accidental clicks don't wipe selection via empty replace.
      if (Math.abs(w) < 3 && Math.abs(h) < 3) {
        const hit = opts.runtime.hitTest(event.clientX, event.clientY);
        start = null;
        draftPoints = [];
        clearDraft();
        if (hit) {
          selection = combineSelection(selection, [hit], gestureCombine);
          paintOverlay();
          notify();
        }
        try {
          opts.runtime.getSvg()?.releasePointerCapture(event.pointerId);
        } catch {
          /* */
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      region = { kind: "rect", x: start.x, y: start.y, w, h };
    } else if (tool === "lasso") {
      draftPoints.push(p);
      if (draftPoints.length < 3) {
        start = null;
        draftPoints = [];
        clearDraft();
        try {
          opts.runtime.getSvg()?.releasePointerCapture(event.pointerId);
        } catch {
          /* */
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      region = { kind: "lasso", points: [...draftPoints] };
    } else if (tool === "bezier") {
      draftPoints.push(p);
      while (draftPoints.length % 3 !== 1) draftPoints.push(p);
      region = { kind: "bezier", points: [...draftPoints] };
    }
    start = null;
    draftPoints = [];
    clearDraft();
    if (region) applyRegion(region, gestureCombine);
    try {
      opts.runtime.getSvg()?.releasePointerCapture(event.pointerId);
    } catch {
      /* */
    }
    event.preventDefault();
    event.stopPropagation();
  };

  function paintDraft(): void {
    const g = ensureOverlay();
    if (!g || !start) return;
    clearDraft();
    if (tool === "rect" && draftPoints[1]) {
      const r = normalizeRect({
        x: start.x,
        y: start.y,
        w: draftPoints[1].x - start.x,
        h: draftPoints[1].y - start.y,
      });
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("data-viva-draft", "1");
      rect.setAttribute("x", String(r.x));
      rect.setAttribute("y", String(r.y));
      rect.setAttribute("width", String(r.w));
      rect.setAttribute("height", String(r.h));
      rect.setAttribute("fill", "rgba(251,191,36,0.12)");
      rect.setAttribute("stroke", "#fbbf24");
      rect.setAttribute("stroke-dasharray", "5 4");
      g.appendChild(rect);
      draftEl = rect;
    } else if ((tool === "lasso" || tool === "bezier") && draftPoints.length > 1) {
      const pts = tool === "bezier" ? sampleBezier(draftPoints) : draftPoints;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("data-viva-draft", "1");
      path.setAttribute(
        "d",
        pts.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x} ${pt.y}`).join(" ") + " Z",
      );
      path.setAttribute("fill", "rgba(251,191,36,0.1)");
      path.setAttribute("stroke", "#fbbf24");
      path.setAttribute("stroke-dasharray", "5 4");
      g.appendChild(path);
      draftEl = path;
    }
  }

  function clearDraft(): void {
    const g = overlay ?? ensureOverlay();
    g?.querySelectorAll("[data-viva-draft]").forEach((el) => el.remove());
    draftEl = null;
  }

  const controller: ReviewController = {
    setTool(t) {
      tool = t;
    },
    setCombine(m) {
      combine = m;
    },
    getTool: () => tool,
    getCombine: () => combine,
    getSelection: () => [...selection],
    clearSelection() {
      selection = [];
      regions = [];
      paintOverlay();
      notify();
    },
    invertSelection() {
      selection = invertSelection(allNodes(), selection);
      paintOverlay();
      notify();
    },
    selectByRegion(region, mode) {
      return applyRegion(region, mode ?? combine);
    },
    selectByIds(ids, mode) {
      const set = new Set(ids);
      const hits = allNodes().filter((n) => set.has(n.id));
      selection = combineSelection(selection, hits, mode ?? combine);
      paintOverlay();
      notify();
      return selection;
    },
    addFeedback(input) {
      const item: ReviewFeedback = {
        id: `fb_${++feedbackSeq}`,
        kind: input.kind,
        text: input.text,
        severity: input.severity ?? (input.kind === "issue" ? "error" : "info"),
        selectionIds: input.selectionIds ?? selection.map((n) => n.id),
        region: input.region,
        tags: input.tags,
        createdAt: Date.now(),
      };
      if (input.anchor) {
        item.anchor = input.anchor;
      } else if (selection[0]) {
        item.anchor = {
          x: selection[0].bbox.x + selection[0].bbox.w / 2,
          y: selection[0].bbox.y - 8,
        };
      }
      feedback.push(item);
      paintOverlay();
      notify();
      return item;
    },
    listFeedback: () => [...feedback],
    clearFeedback() {
      feedback = [];
      paintOverlay();
      notify();
    },
    snapshot,
    attach() {
      if (attached) return;
      const svg = opts.runtime.getSvg();
      if (!svg) return;
      attached = true;
      svg.addEventListener("pointerdown", onPointerDown, true);
      svg.addEventListener("pointermove", onPointerMove, true);
      svg.addEventListener("pointerup", onPointerUp, true);
      ensureOverlay();
    },
    detach() {
      if (!attached) return;
      const svg = opts.runtime.getSvg();
      svg?.removeEventListener("pointerdown", onPointerDown, true);
      svg?.removeEventListener("pointermove", onPointerMove, true);
      svg?.removeEventListener("pointerup", onPointerUp, true);
      attached = false;
    },
    destroy() {
      controller.detach();
      overlay?.remove();
      overlay = null;
    },
  };

  return controller;
}

function severityColor(s: FeedbackSeverity): string {
  if (s === "error") return "#f87171";
  if (s === "warn") return "#fbbf24";
  return "#94a3b8";
}

function cssSel(id: string): string {
  return id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Adapt a live Runtime into ReviewController view (call after start). */
export function runtimeReviewView(
  runtime: Runtime,
  irNodes: () => SelectedNode[],
): RuntimeView {
  return {
    exportSvg: () => runtime.exportSvg(),
    getSvg: () => runtime.getSvg(),
    hitTest: (x, y) => runtime.hitTest(x, y),
    scenePoint: (x, y) => runtime.scenePoint(x, y),
    listNodes: () => {
      const fromDom = runtime.listPaintedNodes();
      return fromDom.length ? fromDom : irNodes();
    },
  };
}

// re-export helper used by session when IR-only
export { listSelectableNodes };
