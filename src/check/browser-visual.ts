/**
 * Browser-safe visual notes from IR geometry. No resvg / sharp.
 * Errors fail compile success; IR is still returned so agents can repair.
 */

import type { VisualIR } from "../ir.js";
import { flattenNodesFromIr } from "../export/static-svg.js";
import { figureCellsFromIr } from "./figure-cells.js";
import type { CheckDiagnostic } from "./types.js";
import { withIrStyleContext } from "./style-context.js";

const MARK_HINT =
  /bar|cell|dot|point|mark|tile|bin|rect|heat|flow|arrow|line|path|scatter|box|violin|shaft|head/i;
const CHROME_HINT =
  /grid|axis|tick|title|caption|legend|label|border|frame|colorbar|chrome|subtitle|panel-label|plotbg|deck|hud|folio|veil/i;

function note(
  code: string,
  message: string,
  severity: CheckDiagnostic["severity"],
  hint?: string,
): CheckDiagnostic {
  return {
    code,
    message,
    severity,
    layer: "visual",
    span: { line: 1, column: 1 },
    hint,
  };
}

export function runBrowserVisual(ir: VisualIR): CheckDiagnostic[] {
  const out: CheckDiagnostic[] = [];
  const { nodes } = withIrStyleContext(ir, () => flattenNodesFromIr(ir));
  const cells = figureCellsFromIr(ir);
  const marks = nodes.filter((n) => {
    if (CHROME_HINT.test(n.name)) return false;
    if (MARK_HINT.test(n.name)) return true;
    const w = Number(n.props.w ?? 0);
    const h = Number(n.props.h ?? 0);
    const r = Number(n.props.r ?? 0);
    return (w > 2 && h > 2) || r > 1;
  });
  if (cells.length >= 2) {
    const empty = cells.filter((cell) => {
      const hits = marks.filter((n) => {
        const x = Number(n.props.x ?? 0);
        const y = Number(n.props.y ?? 0);
        return x >= cell.x0 && x <= cell.x1 && y >= cell.y0 && y <= cell.y1;
      });
      return hits.length === 0;
    });
    if (empty.length) {
      out.push(
        note(
          "check.visual.emptyPanel",
          `${empty.length} of ${cells.length} figure cells look empty (${empty.map((c) => c.name).join(", ")})`,
          "error",
          "Bind a chart.* to that panel or drop the unused cell.",
        ),
      );
    }
  } else if (cells.length >= 1 && !marks.length) {
    out.push(
      note(
        "check.visual.blank",
        "figure cell flattens to chrome without mark-sized geometry",
        "error",
        "Add chart.* marks or World nodes with w/h/r.",
      ),
    );
  }
  return out;
}
