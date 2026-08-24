import type { VisualIR } from "../ir.js";
import { flattenNodesFromIr } from "../export/static-svg.js";
import { bboxIntersects, type BBox } from "../review/geometry.js";
import { listSelectableNodes } from "../review/nodes.js";
import type { SelectedNode } from "../review/types.js";
import type { CheckDiagnostic, CheckOptions } from "./types.js";
import { withIrStyleContext } from "./style-context.js";
import { figureCellsFromIr, type FigureCellPx } from "./figure-cells.js";

const MARK_HINT =
  /bar|cell|dot|point|mark|tile|bin|rect|heat|flow|arrow|line|path|scatter/i;
const CHROME_HINT =
  /grid|axis|tick|title|caption|legend|label|border|frame|colorbar|chrome|subtitle|panel-label|plotbg|plot-bg|flowbg|flow-bg|panelbg|brush|hud|typegrid|deck/i;
const PAPER_CHROME_TEXT =
  /(_title(?:_\d+)?|_xTitle|_yTitle|_legLbl_|_lab_|cbarTitle|cbarLbl|_zTitle)/i;
const CHROME_OVERFLOW_PX = 1.5;

function push(
  out: CheckDiagnostic[],
  code: string,
  message: string,
  severity: CheckDiagnostic["severity"],
  hint?: string,
): void {
  out.push({
    code,
    message,
    severity,
    layer: "structural",
    span: { line: 1, column: 1 },
    hint,
  });
}

function isChromeNode(n: SelectedNode): boolean {
  const name = n.name.toLowerCase();
  if (CHROME_HINT.test(name)) return true;
  if (/bg$/i.test(n.name) && n.bbox.w >= 80 && n.bbox.h >= 40) return true;
  if (n.bbox.w >= 400 && n.bbox.h >= 200) return true;
  return false;
}

function isMarkNode(n: SelectedNode): boolean {
  if (isChromeNode(n)) return false;
  const name = n.name.toLowerCase();
  if (MARK_HINT.test(name)) return true;
  const area = n.bbox.w * n.bbox.h;
  if (area < 4) return false;
  if (n.bbox.w < 200 && n.bbox.h < 200) return true;
  return false;
}

function iou(a: BBox, b: BBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) return 0;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function isPaperChromeText(n: SelectedNode): boolean {
  return PAPER_CHROME_TEXT.test(n.name);
}

function cellForChrome(n: SelectedNode, cells: FigureCellPx[]): FigureCellPx | undefined {
  const byPrefix = cells.find((c) => n.name === c.name || n.name.startsWith(`${c.name}_`));
  if (byPrefix) return byPrefix;
  return cells.find((c) => n.name.endsWith(`_lab_${c.name}`));
}

function overflowAmount(
  b: BBox,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  pad: number,
): number {
  return Math.max(
    0,
    x0 + pad - b.x,
    y0 + pad - b.y,
    b.x + b.w - (x1 - pad),
    b.y + b.h - (y1 - pad),
  );
}

function overlapRatio(a: BBox, b: BBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const minArea = Math.min(a.w * a.h, b.w * b.h);
  return minArea > 0 ? inter / minArea : 0;
}

function overlapPairIgnored(a: SelectedNode, b: SelectedNode): boolean {
  const isSmallLabel = (n: SelectedNode) =>
    /lbl|label|leg|text|tick/i.test(n.name) && n.bbox.w * n.bbox.h < 8000;
  if (isSmallLabel(a) || isSmallLabel(b)) return true;
  const areaA = a.bbox.w * a.bbox.h;
  const areaB = b.bbox.w * b.bbox.h;
  if (areaA < 500 && areaB < 500) return true;
  const thin = (n: SelectedNode) => Math.min(n.bbox.w, n.bbox.h) < 5;
  if (thin(a) && thin(b)) return true;
  if (/^seg_/i.test(a.name) && /^seg_/i.test(b.name)) return true;
  return false;
}

export function runStructuralChecks(ir: VisualIR, opts: CheckOptions = {}): CheckDiagnostic[] {
  const margin = opts.boundsMargin ?? 4;
  const out: CheckDiagnostic[] = [];

  const { scene, nodes: flatNodes } = withIrStyleContext(ir, () => flattenNodesFromIr(ir));
  const selectable = withIrStyleContext(ir, () => listSelectableNodes(ir));

  if (flatNodes.length === 0) {
    push(
      out,
      "check.struct.empty",
      "scene has no painted nodes after flatten",
      "error",
      "Add visible nodes or check layer visibility.",
    );
    return out;
  }

  const marks = selectable.filter(isMarkNode);
  if (marks.length === 0 && selectable.length > 2) {
    push(
      out,
      "check.struct.noMarks",
      `flatten produced ${selectable.length} nodes but no mark-sized geometry`,
      "warn",
      "Charts may be invisible or only chrome was painted.",
    );
  }

  for (const n of marks) {
    const b = n.bbox;
    if (b.w < 0.75 || b.h < 0.75) {
      push(
        out,
        "check.struct.tiny",
        `mark '${n.name}' is tiny (${b.w.toFixed(1)}×${b.h.toFixed(1)}px)`,
        "warn",
        "Increase bar width, cell size, or point radius.",
      );
    }
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const outside =
      cx < -margin ||
      cy < -margin ||
      cx > scene.width + margin ||
      cy > scene.height + margin;
    if (outside) {
      push(
        out,
        "check.struct.outOfBounds",
        `mark '${n.name}' center (${cx.toFixed(0)},${cy.toFixed(0)}) outside scene ${scene.width}×${scene.height}`,
        "warn",
        "Align frame/plot coordinates or fix frame: mapping.",
      );
    }
  }

  const markRects = marks.filter((m) => m.bbox.w > 1 && m.bbox.h > 1);
  for (let i = 0; i < markRects.length; i++) {
    for (let j = i + 1; j < markRects.length; j++) {
      const a = markRects[i]!;
      const b = markRects[j]!;
      if (overlapPairIgnored(a, b)) continue;
      if (!bboxIntersects(a.bbox, b.bbox)) continue;
      const ratio = overlapRatio(a.bbox, b.bbox);
      const iouVal = iou(a.bbox, b.bbox);
      if (ratio > 0.55 || iouVal > 0.45) {
        push(
          out,
          "check.struct.overlap",
          `marks '${a.name}' and '${b.name}' overlap heavily (${(ratio * 100).toFixed(0)}% of smaller)`,
          "warn",
          "Use dodge/lane grouping, barWidth, or fix duplicate x/y in data.",
        );
      }
    }
  }

  const bars = markRects.filter((m) => /bar/i.test(m.name));
  const byRow = new Map<number, SelectedNode[]>();
  for (const bar of bars) {
    const rowKey = Math.round(bar.bbox.y / 4) * 4;
    const row = byRow.get(rowKey) ?? [];
    row.push(bar);
    byRow.set(rowKey, row);
  }
  for (const row of byRow.values()) {
    if (row.length < 2) continue;
    const sorted = [...row].sort((a, b) => a.bbox.x - b.bbox.x);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]!;
      const b = sorted[i + 1]!;
      const gap = b.bbox.x - (a.bbox.x + a.bbox.w);
      if (gap < -0.5) {
        push(
          out,
          "check.struct.barCrowding",
          `bars '${a.name}' and '${b.name}' crowd horizontally (gap ${gap.toFixed(1)}px)`,
          "warn",
          "Spread visit/lane keys or reduce barWidth.",
        );
      }
    }
  }

  const cells = markRects.filter((m) => /cell|heat|tile/i.test(m.name));
  if (cells.length >= 4) {
    const fills = new Set<string>();
    for (const fn of flatNodes) {
      if (!/cell|heat|tile/i.test(fn.name)) continue;
      const fill = fn.props.fill ?? fn.props.color;
      if (typeof fill === "string") fills.add(fill.toLowerCase());
    }
    if (fills.size <= 1) {
      push(
        out,
        "check.struct.flatHeatmap",
        `heatmap cells (${cells.length}) share a single fill color`,
        "error",
        "Use palette(c.tier, sequential) or fix role: mark-area parsing.",
      );
    }
  }

  const figureCells = figureCellsFromIr(ir);
  const chromeTexts = selectable.filter(isPaperChromeText);
  for (const n of chromeTexts) {
    const sceneOverflow = overflowAmount(n.bbox, 0, 0, scene.width, scene.height, 0);
    if (sceneOverflow > CHROME_OVERFLOW_PX) {
      push(
        out,
        "check.struct.chromeOverflow",
        `chrome '${n.name}' overflows scene by ${sceneOverflow.toFixed(1)}px`,
        "warn",
        "Grow plot insets or shorten the title/axis/legend; compiler already wraps and nudges chrome.",
      );
      continue;
    }
    const cell = cellForChrome(n, figureCells);
    if (!cell) continue;
    const cellOverflow = overflowAmount(n.bbox, cell.x0, cell.y0, cell.x1, cell.y1, 0);
    if (cellOverflow > CHROME_OVERFLOW_PX) {
      push(
        out,
        "check.struct.chromeOverflow",
        `chrome '${n.name}' overflows panel '${cell.name}' by ${cellOverflow.toFixed(1)}px`,
        "warn",
        "Let the compiler size insets (omit inset*/areaX) or wrap the caption.",
      );
    }
  }

  return out;
}
