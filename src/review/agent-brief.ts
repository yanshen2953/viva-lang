import type { ReviewFeedback, ReviewSnapshot, SelectedNode } from "./types.js";

/** Build an LLM-facing brief so the agent knows *what* to fix and *how*. */
export function buildAgentBrief(opts: {
  selection: SelectedNode[];
  feedback: ReviewFeedback[];
  sourceExcerpt?: string;
}): string {
  const lines: string[] = [];
  lines.push("## Viva visual review feedback");
  lines.push("");
  if (opts.selection.length) {
    lines.push("### Selection (user highlighted)");
    for (const n of opts.selection) {
      lines.push(
        `- id=\`${n.id}\` name=\`${n.name}\` layer=\`${n.layerName}\` bbox=(${fmt(n.bbox.x)},${fmt(n.bbox.y)},${fmt(n.bbox.w)}×${fmt(n.bbox.h)})`,
      );
    }
    lines.push("");
  } else {
    lines.push("### Selection: (none — feedback may be scene-wide)");
    lines.push("");
  }

  if (opts.feedback.length) {
    lines.push("### Feedback items");
    for (const f of opts.feedback) {
      const ids = f.selectionIds.length ? f.selectionIds.join(", ") : "(region/scene)";
      lines.push(
        `- [${f.severity}/${f.kind}] ${f.text} → targets: ${ids}${f.tags?.length ? ` tags=${f.tags.join(",")}` : ""}`,
      );
    }
    lines.push("");
    lines.push("### Repair policy");
    lines.push("- Honor `keep` / `constraint` (do not regress those regions).");
    lines.push("- Prefer minimal patch: fix `issue`/`fix`/`data`/`style`/`layout`/`interaction`/`label` only.");
    lines.push("- Output ONLY full corrected Viva source starting with `artifact`.");
    lines.push("");
  }

  if (opts.sourceExcerpt) {
    lines.push("### Current source (excerpt)");
    lines.push("```viva");
    lines.push(opts.sourceExcerpt.slice(0, 6000));
    lines.push("```");
  }
  return lines.join("\n");
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function emptySnapshot(partial: Partial<ReviewSnapshot> & Pick<ReviewSnapshot, "sceneSvg" | "selectionSvg" | "agentBrief">): ReviewSnapshot {
  return {
    tool: "rect",
    combine: "replace",
    selection: [],
    regions: [],
    feedback: [],
    payload: { ids: [], names: [], feedback: [] },
    ...partial,
  };
}
