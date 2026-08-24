/** Linked-view phase for brush / selection / play. Runtime state, not a keyword. */

export type ViewPhase = "idle" | "brushing" | "selected" | "linked" | "playing";

export type ViewEvent = "brush" | "release" | "clear" | "link" | "play" | "stop" | "page";

export type ViewSnapshot = {
  phase: ViewPhase;
  beat: number;
  t: number;
  selN: number;
  brushOn: boolean;
  linked: boolean;
  page: number;
  via?: ViewEvent;
};

const TRANSITIONS: Record<ViewPhase, Partial<Record<ViewEvent, ViewPhase>>> = {
  idle: { brush: "brushing", play: "playing", link: "linked" },
  brushing: { release: "selected", clear: "idle", play: "playing", link: "linked" },
  selected: { brush: "brushing", clear: "idle", link: "linked", play: "playing", page: "selected" },
  linked: { brush: "brushing", clear: "idle", play: "playing", page: "linked" },
  playing: { stop: "idle", brush: "brushing", page: "playing" },
};

export function guardView(from: ViewPhase, event: ViewEvent): ViewPhase {
  return TRANSITIONS[from]?.[event] ?? from;
}

export function inferViewEvent(
  prev: ViewSnapshot | null,
  next: Omit<ViewSnapshot, "via">,
): ViewEvent | undefined {
  if (next.phase === "playing" && prev?.phase !== "playing") return "play";
  if (prev?.phase === "playing" && next.phase !== "playing") return "stop";
  if (next.brushOn && !prev?.brushOn) return "brush";
  if (!next.brushOn && prev?.brushOn) return next.selN > 0 ? "release" : "clear";
  if (next.selN === 0 && (prev?.selN ?? 0) > 0) return "clear";
  if (next.linked && !prev?.linked) return "link";
  if (next.page !== (prev?.page ?? 0)) return "page";
  return undefined;
}

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
  const page = Number(state.__page ?? sel?.page ?? brush?.page ?? 0) || 0;
  let phase: ViewPhase = "idle";
  if (opts.playing) phase = "playing";
  else if (brushOn) phase = "brushing";
  else if (linked) phase = "linked";
  else if (selN > 0) phase = "selected";
  const prev = asView(state.__view);
  const via = inferViewEvent(prev, { phase, beat, t, selN, brushOn, linked, page });
  if (prev && via) phase = guardView(prev.phase, via);
  return { phase, beat, t, selN, brushOn, linked, page, via };
}

export function applyViewState(
  state: Record<string, unknown>,
  opts: { playing?: boolean } = {},
): ViewSnapshot {
  const snap = sampleView(state, opts);
  state.__view = snap;
  if (snap.page) state.__page = snap.page;
  return snap;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asView(value: unknown): ViewSnapshot | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const phase = rec.phase;
  if (
    phase !== "idle" &&
    phase !== "brushing" &&
    phase !== "selected" &&
    phase !== "linked" &&
    phase !== "playing"
  ) {
    return null;
  }
  return {
    phase,
    beat: Number(rec.beat ?? 0) || 0,
    t: Number(rec.t ?? 0) || 0,
    selN: Number(rec.selN ?? 0) || 0,
    brushOn: Boolean(rec.brushOn),
    linked: Boolean(rec.linked),
    page: Number(rec.page ?? 0) || 0,
    via: rec.via as ViewEvent | undefined,
  };
}
