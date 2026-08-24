/**
 * Browser-safe visual notes from IR geometry. No resvg / sharp.
 * Warn only — never flip compile success.
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
  hint?: string,
): CheckDiagnostic {
  return {
    code,
    message,
    severity: "warn",
    layer: "visual",
    span: { line: 1, column: 1 },
    hint,
  };
}

export function runBrowserVisual(ir: VisualIR): CheckDiagnostic[] {
  const out: CheckDiagnostic[] = [];
  const { nodes } = withIrStyleContext(ir, () => flattenNodesFromIr(ir));
  const cells = figureCellsFromIr(ir);
  const marks = nodes.filter((n) => MARK_HINT.test(n.name) && !CHROME_HINT.test(n.name));
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
          "Bind a chart.* to that panel or drop the unused cell.",
        ),
      );
    }
  }
  if (!marks.length && nodes.length > 4) {
    out.push(
      note(
        "check.visual.blank",
        "scene flattens to chrome without mark-sized geometry",
        "Add chart.* marks or World nodes with w/h/r.",
      ),
    );
  }
  return out;
}
