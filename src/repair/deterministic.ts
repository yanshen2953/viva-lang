/** Source patches from structural / axis diagnostics. One language, no new keywords. */

export type RepairOp = "remove-line" | "hint";

export type RepairPatch = {
  op: RepairOp;
  reason: string;
  code: string;
  line?: number;
  match?: RegExp;
  hint?: string;
};

export type RepairPlan = {
  patches: RepairPatch[];
  notes: string[];
};

const MAGIC_LINE =
  /^\s*(areaX|areaY|insetL|insetR|insetT|insetB|inset\*|plotPadL|plotPadR|plotPadT|plotPadB)\s*:/i;

export function planRepairs(
  source: string,
  diagnostics: Array<{ code?: string; message?: string; hint?: string }> = [],
): RepairPlan {
  const patches: RepairPatch[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  const add = (patch: RepairPatch) => {
    const key = `${patch.op}|${patch.code}|${patch.line ?? patch.match?.source ?? ""}`;
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
    add({
      op: "hint",
      reason: "empty panel / no marks",
      code: "repair.emptyPanel",
      hint: "Bind a chart.* to panel: a (or body) with data rows; do not leave a cell as chrome only.",
    });
  }

  if (axis) {
    add({
      op: "hint",
      reason: "axis semantics",
      code: "repair.axis",
      hint: "Prefer xLabel/yLabel/xUnit/yUnit and omit handmade tick nodes; log/time get minors from the compiler.",
    });
  }

  for (const p of patches) notes.push(p.hint ?? p.reason);
  return { patches, notes };
}

export function applyRepairs(source: string, plan: RepairPlan): { source: string; applied: RepairPatch[] } {
  if (!plan.patches.length) return { source, applied: [] };
  const drop = new Set(
    plan.patches.filter((p) => p.op === "remove-line" && p.line).map((p) => p.line!),
  );
  if (!drop.size) return { source, applied: plan.patches.filter((p) => p.op === "hint") };
  const next = source
    .split(/\r?\n/)
    .filter((_, i) => !drop.has(i + 1))
    .join("\n");
  return { source: next, applied: plan.patches };
}

export function repairSource(
  source: string,
  diagnostics: Array<{ code?: string; message?: string; hint?: string }> = [],
): { source: string; plan: RepairPlan; changed: boolean } {
  const plan = planRepairs(source, diagnostics);
  const applied = applyRepairs(source, plan);
  return { source: applied.source, plan, changed: applied.source !== source };
}
