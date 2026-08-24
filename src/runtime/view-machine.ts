/** Linked-view phase for brush / selection / play. Runtime state, not a keyword. */

export type ViewPhase = "idle" | "brushing" | "selected" | "linked" | "playing";

export type ViewSnapshot = {
  phase: ViewPhase;
  beat: number;
  t: number;
  selN: number;
  brushOn: boolean;
  linked: boolean;
};

export function sampleView(
  state: Record<string, unknown>,
  opts: { playing?: boolean } = {},
): ViewSnapshot {
  const brush = asRecord(state.__brush);
  const sel = asRecord(state.__sel);
  const selN = Number(sel?.n ?? 0) || 0;
  const brushOn = Boolean(brush?.on);
  const brushFrame = String(brush?.frame ?? "");
  const linked = selN > 0 && Boolean(brushFrame);
  const beat = Number(state.__beat ?? 0) || 0;
  const t = Number(state.__t ?? 0) || 0;
  let phase: ViewPhase = "idle";
  if (opts.playing) phase = "playing";
  else if (brushOn) phase = "brushing";
  else if (linked) phase = "linked";
  else if (selN > 0) phase = "selected";
  return { phase, beat, t, selN, brushOn, linked };
}

export function applyViewState(
  state: Record<string, unknown>,
  opts: { playing?: boolean } = {},
): ViewSnapshot {
  const snap = sampleView(state, opts);
  state.__view = snap;
  return snap;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
