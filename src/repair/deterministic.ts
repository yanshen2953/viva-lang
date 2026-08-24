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
const ORPHAN_SCENE_PROP =
  /^(unit|column|page|height|background|width|size)\s*:/i;

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
  const folded = sanitizeGeneratedViva(source);
  const plan = planRepairs(folded, diagnostics);
  if (folded !== source) {
    plan.patches.unshift({
      op: "hint",
      reason: "canonicalize generated Viva (scene props, quotes, YAML, garbage lines)",
      code: "repair.canonicalize",
      hint: "unit/column/page live under scene; quote CJK; drop illegal top-level lines.",
    });
    plan.notes.unshift("canonicalize generated Viva");
  }
  const applied = applyRepairs(folded, plan);
  return { source: applied.source, plan, changed: applied.source !== source };
}

const KNOWN_PROP =
  /^(title|subtitle|caption|body|beats|play|panel|span|data|xField|yField|xlim|ylim|xLabel|yLabel|cols|rows|group|playFps|guides|column|unit|page|height|background|size|bind|controls)$/;

const TOP_DECL =
  /^(artifact|state|data|entity|scene|event|rule|bind|tick|animate|widget|timeline|frame|function)\b/;
const ORPHAN_TOP = /^(unit|column|page|height|background|width|size)\s*:/;
const UNSAFE_LIT = /[^\x00-\x7F]|[·•—–]/;

/** Lexer-safe folds for the shapes models actually emit. Order is significant. */
export function sanitizeGeneratedViva(source: string): string {
  return quoteUnsafeLiterals(
    foldBadFrameTitle(
      foldMissingPropColons(
        foldOrphanSceneProps(
          dropInventedTimeline(
            dropInvalidEvents(
              dropIllegalLines(foldBareWidgets(foldBindArrow(foldYamlDeclColons(source)))),
            ),
          ),
        ),
      ),
    ),
  );
}

function quoteBareValue(value: string): string {
  const v = value.trim();
  if (!v) return value;
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return value.startsWith(" ") ? ` ${v}` : v;
  }
  if (/^[[{]/.test(v) || /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return value;
  if (/^(true|false|none)$/.test(v)) return value;
  if (/^[-0-9.][\d.\s]*$/.test(v)) return value;
  if (!UNSAFE_LIT.test(v) && /^[A-Za-z_][\w.]*(?:\s+[A-Za-z0-9_.-]+)*$/.test(v)) return value;
  return JSON.stringify(v);
}

/** `title: 到站件` / `{ arm: 对照 }` — unquoted CJK dies in the lexer. */
export function quoteUnsafeLiterals(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      const prop = line.match(/^(\s*)([A-Za-z_][\w.]*)\s*:\s*(.*)$/);
      if (prop && !/^\s*[[{]/.test(prop[3] ?? "")) {
        return `${prop[1]}${prop[2]}: ${quoteBareValue(prop[3] ?? "")}`;
      }
      return line.replace(/:\s*(?!["'\d#[{\s-])([^,}\]\n]+)/g, (full, raw: string) => {
        if (!UNSAFE_LIT.test(raw)) return full;
        return `: ${JSON.stringify(String(raw).trim())}`;
      });
    })
    .join("\n");
}

/** `bind beat = __beat` — models emit `=` instead of `<-`. */
export function foldBindArrow(source: string): string {
  return source.replace(/^(bind\s+\S+)\s+=\s+/gm, "$1 <- ");
}

/** `scene:` / `state n: 0` — models emit YAML declarations. */
export function foldYamlDeclColons(source: string): string {
  return source
    .replace(/^(\s*)(scene|timeline)\s*:\s*$/gm, "$1$2")
    .replace(/^(state|data)\s+(\w+)\s*:\s*/gm, "$1 $2 = ");
}

/** `.chart.scatter` / `layout.board` at indent 0. */
export function foldBareWidgets(source: string): string {
  return source
    .replace(/^(\s*)\.(layout|chart)\./gm, "$1widget $2.")
    .replace(/^(layout\.(?:board|figure)|chart\.\w+)\b/gm, "widget $1");
}

/** Lone `.` / Chinese prose / markdown leftovers are not declarations. */
export function dropIllegalLines(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => {
      if (/^\s*[.\-–—…·]{1,6}\s*$/.test(line)) return false;
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      const trimmed = line.trim();
      if (/^[\]}),;]+$/.test(trimmed)) return true;
      if (indent === 0 && trimmed && !trimmed.startsWith("#") && !TOP_DECL.test(trimmed) && !ORPHAN_TOP.test(trimmed)) {
        return false;
      }
      if (indent > 0 && /^[\u3000-\u9fff]/.test(trimmed) && !/:\s/.test(line)) return false;
      return true;
    })
    .join("\n");
}

const KNOWN_EVENT = /^(click|hover|dragstart|drag|dragend|collide|key)$/;

/** `event brush on chart.scatter` leaves a DOT at declaration level. */
export function dropInvalidEvents(source: string): string {
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  let skipIndent: number | null = null;
  for (const line of lines) {
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (skipIndent !== null) {
      if (!line.trim() || indent > skipIndent) continue;
      skipIndent = null;
    }
    const m = line.match(/^(\s*)event\s+(\w+)\s+on\s+(\S+)/);
    if (m && (!KNOWN_EVENT.test(m[2]!) || /\./.test(m[3]!))) {
      skipIndent = indent;
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Models invent `timeline` / `beat 1` / nested widget blocks. Clock is board beats+play. */
export function dropInventedTimeline(source: string): string {
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent === 0 && /^timeline\s*:?\s*$/.test(line.trim())) {
      let j = i + 1;
      while (j < lines.length && !lines[j]!.trim()) j += 1;
      const peek = lines[j] ?? "";
      if (/^\s+(beat\b|widget\b)/.test(peek)) {
        i += 1;
        while (i < lines.length) {
          const t = lines[i]!;
          const nextIndent = t.match(/^(\s*)/)?.[1].length ?? 0;
          if (t.trim() && nextIndent === 0) break;
          i += 1;
        }
        continue;
      }
    }
    out.push(line);
    i += 1;
  }
  return out.join("\n");
}

/** `title 到站件` → `title: "到站件"` — models drop the colon on widget props. */
export function foldMissingPropColons(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^(\s+)([A-Za-z][\w.]*)\s+(?![:\s=/])(.+)$/);
      if (!m || !KNOWN_PROP.test(m[2]!)) return line;
      return `${m[1]}${m[2]}: ${quoteBareValue(m[3]!)}`;
    })
    .join("\n");
}

/** `frame 到站件 · 双栏` is not a frame name — it is a board title. */
export function foldBadFrameTitle(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^(\s*)frame\s+(.+)$/);
      if (!m) return line;
      const name = m[2]!.trim();
      if (/^[A-Za-z_][\w.]*$/.test(name)) return line;
      const title = name.replace(/^["']|["']$/g, "");
      return `${m[1]}widget layout.board\n${m[1]}  title: ${JSON.stringify(title)}`;
    })
    .join("\n");
}

/** `unit:` / `column:` / `page:` at indent 0 are not declarations — tuck them under `scene`. */
export function foldOrphanSceneProps(source: string): string {
  const lines = source.split(/\r?\n/);
  const kept: string[] = [];
  const orphans: string[] = [];
  let inScene = false;
  let sceneIdx = -1;
  for (const raw of lines) {
    const trimmed = raw.trim();
    const indent = raw.match(/^(\s*)/)?.[1].length ?? 0;
    if (trimmed && !trimmed.startsWith("#") && indent === 0 && /^scene\b/.test(trimmed)) {
      inScene = true;
      sceneIdx = kept.length;
      kept.push(raw);
      continue;
    }
    if (inScene && trimmed && !trimmed.startsWith("#") && indent === 0) inScene = false;
    if (!inScene && trimmed && indent === 0 && ORPHAN_SCENE_PROP.test(trimmed)) {
      orphans.push(`  ${trimmed}`);
      continue;
    }
    kept.push(raw);
  }
  if (!orphans.length) return source;
  if (sceneIdx < 0) {
    const art = kept.findIndex((line) => /^\s*artifact\b/.test(line));
    const at = art >= 0 ? art + 1 : 0;
    kept.splice(at, 0, "scene", ...orphans);
  } else {
    kept.splice(sceneIdx + 1, 0, ...orphans);
  }
  return kept.join("\n");
}

function fieldOf(lines: string[], key: string): string | null {
  for (const line of lines) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*:\\s*([^\\s#]+)`));
    if (m?.[1]) return m[1].replace(/^["']|["']$/g, "");
  }
  return null;
}
