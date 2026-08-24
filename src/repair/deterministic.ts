/** Source patches from structural / axis diagnostics. One language, no new keywords. */

export type RepairOp = "remove-line" | "insert-line" | "replace-line" | "hint";

export type RepairPatch = {
  op: RepairOp;
  reason: string;
  code: string;
  line?: number;
  match?: RegExp;
  text?: string;
  hint?: string;
};

export type RepairPlan = {
  patches: RepairPatch[];
  notes: string[];
};

const MAGIC_LINE =
  /^\s*(areaX|areaY|insetL|insetR|insetT|insetB|inset\*|plotPadL|plotPadR|plotPadT|plotPadB)\s*:/i;
const HAND_TICK =
  /^\s*(xTicks|yTicks|xticks|yticks|tickVals|xTickVals|yTickVals)\s*:/i;

export function planRepairs(
  source: string,
  diagnostics: Array<{ code?: string; message?: string; hint?: string }> = [],
): RepairPlan {
  const patches: RepairPatch[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  const add = (patch: RepairPatch) => {
    const key = `${patch.op}|${patch.code}|${patch.line ?? patch.match?.source ?? patch.text ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    patches.push(patch);
  };

  const lines = source.split(/\r?\n/);
  const overflow = diagnostics.some((d) => (d.code ?? "").includes("chromeOverflow"));
  const empty = diagnostics.some((d) =>
    /emptyPanel|empty|noMarks|blank/i.test(`${d.code ?? ""} ${d.message ?? ""}`),
  );
  const axis = diagnostics.some((d) => /axis|tick|scale/i.test(`${d.code ?? ""} ${d.message ?? ""}`));

  if (overflow) {
    for (const [i, line] of lines.entries()) {
      if (MAGIC_LINE.test(line)) {
        add({
          op: "remove-line",
          reason: "hand-written inset/area fights the chrome solver",
          code: "repair.dropMagic",
          line: i + 1,
        });
      }
    }
    if (!patches.some((p) => p.code === "repair.dropMagic")) {
      add({
        op: "hint",
        reason: "omit inset* / areaX and let the compiler size chrome",
        code: "repair.omitInsets",
        hint: "Delete insetL/R/T/B and areaX/areaY; layout.figure already solves insets.",
      });
    }
  }

  if (empty) {
    const chartIdx = lines.findIndex((line) => /^\s*widget chart\./.test(line));
    const hasDataBind = lines.some((line) => /^\s*data\s*:/.test(line));
    const dataDecl = lines.find((line) => /^\s*data\s+\w+/.test(line));
    const dataName = dataDecl?.match(/^\s*data\s+(\w+)/)?.[1];
    if (chartIdx >= 0 && !hasDataBind && dataName) {
      add({
        op: "insert-line",
        reason: "empty panel / no marks — bind the declared data table",
        code: "repair.bindData",
        line: chartIdx + 2,
        text: `  data: ${dataName}`,
      });
    } else {
      const colsIdx = lines.findIndex((line) => /^\s*cols\s*:\s*[2-9]/.test(line));
      const chartCount = lines.filter((line) => /^\s*widget chart\./.test(line)).length;
      if (colsIdx >= 0 && chartCount > 0 && chartCount < 2) {
        add({
          op: "replace-line",
          reason: "empty extra figure cell",
          code: "repair.dropEmptyCol",
          line: colsIdx + 1,
          text: "  cols: 1",
        });
      } else {
        add({
          op: "hint",
          reason: "empty panel / no marks",
          code: "repair.emptyPanel",
          hint: "Bind a chart.* to panel: a (or body) with data rows; do not leave a cell as chrome only.",
        });
      }
    }
  }

  if (axis) {
    for (const [i, line] of lines.entries()) {
      if (HAND_TICK.test(line)) {
        add({
          op: "remove-line",
          reason: "handmade ticks fight compiler axis grammar",
          code: "repair.dropHandTicks",
          line: i + 1,
        });
      }
    }
    const xField = fieldOf(lines, "xField");
    const yField = fieldOf(lines, "yField");
    const hasXLabel = lines.some((line) => /^\s*xLabel\s*:/.test(line));
    const hasYLabel = lines.some((line) => /^\s*yLabel\s*:/.test(line));
    const chartIdx = lines.findIndex((line) => /^\s*widget chart\./.test(line));
    if (chartIdx >= 0 && xField && !hasXLabel) {
      add({
        op: "insert-line",
        reason: "axis caption from xField",
        code: "repair.xLabel",
        line: chartIdx + 2,
        text: `  xLabel: ${xField}`,
      });
    }
    if (chartIdx >= 0 && yField && !hasYLabel) {
      add({
        op: "insert-line",
        reason: "axis caption from yField",
        code: "repair.yLabel",
        line: chartIdx + 2,
        text: `  yLabel: ${yField}`,
      });
    }
    if (!patches.some((p) => p.code.startsWith("repair.") && p.op !== "hint")) {
      add({
        op: "hint",
        reason: "axis semantics",
        code: "repair.axis",
        hint: "Prefer xLabel/yLabel/xUnit/yUnit and omit handmade tick nodes; log/time get minors from the compiler.",
      });
    }
  }

  for (const p of patches) notes.push(p.hint ?? p.reason);
  return { patches, notes };
}

export function applyRepairs(source: string, plan: RepairPlan): { source: string; applied: RepairPatch[] } {
  if (!plan.patches.length) return { source, applied: [] };
  const rows = source.split(/\r?\n/);
  const drop = new Set(plan.patches.filter((p) => p.op === "remove-line" && p.line).map((p) => p.line!));
  const replace = new Map(
    plan.patches
      .filter((p) => p.op === "replace-line" && p.line && p.text !== undefined)
      .map((p) => [p.line!, p.text!]),
  );
  const inserts = plan.patches
    .filter((p) => p.op === "insert-line" && p.line && p.text)
    .sort((a, b) => (b.line ?? 0) - (a.line ?? 0));
  const next = rows.map((line, i) => {
    const n = i + 1;
    if (replace.has(n)) return replace.get(n)!;
    return line;
  });
  const kept = next.filter((_, i) => !drop.has(i + 1));
  const droppedBefore = (line: number) => [...drop].filter((d) => d < line).length;
  for (const patch of inserts) {
    const at = Math.max(0, (patch.line ?? 1) - 1 - droppedBefore(patch.line ?? 1));
    kept.splice(at, 0, patch.text!);
  }
  const changed = drop.size > 0 || replace.size > 0 || inserts.length > 0;
  return { source: kept.join("\n"), applied: changed ? plan.patches : plan.patches.filter((p) => p.op === "hint") };
}

export function repairSource(
  source: string,
  diagnostics: Array<{ code?: string; message?: string; hint?: string }> = [],
): { source: string; plan: RepairPlan; changed: boolean } {
  const plan = planRepairs(source, diagnostics);
  const applied = applyRepairs(source, plan);
  return { source: applied.source, plan, changed: applied.source !== source };
}

function fieldOf(lines: string[], key: string): string | null {
  for (const line of lines) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*:\\s*([^\\s#]+)`));
    if (m?.[1]) return m[1].replace(/^["']|["']$/g, "");
  }
  return null;
}
