/** Linked-view + play phase machine. Runtime state, not a keyword. */

export type ViewPhase =
  | "idle"
  | "hover"
  | "dragging"
  | "brushing"
  | "selected"
  | "linked"
  | "playing"
  | "paused"
  | "paging";

export type ViewEvent =
  | "hover"
  | "leave"
  | "drag"
  | "drop"
  | "brush"
  | "release"
  | "clear"
  | "link"
  | "play"
  | "pause"
  | "stop"
  | "page";

export type ViewSnapshot = {
  phase: ViewPhase;
  beat: number;
  t: number;
  selN: number;
  brushOn: boolean;
  linked: boolean;
  page: number;
  hoverOn: boolean;
  dragging: boolean;
  paused: boolean;
  via?: ViewEvent;
};

const PHASES: readonly ViewPhase[] = [
  "idle",
  "hover",
  "dragging",
  "brushing",
  "selected",
  "linked",
  "playing",
  "paused",
  "paging",
];

const TRANSITIONS: Record<ViewPhase, Partial<Record<ViewEvent, ViewPhase>>> = {
  idle: { hover: "hover", drag: "dragging", brush: "brushing", play: "playing", link: "linked", page: "paging" },
  hover: {
    leave: "idle",
    drag: "dragging",
    brush: "brushing",
    play: "playing",
    link: "linked",
    page: "paging",
  },
  dragging: { drop: "idle", brush: "brushing", play: "playing", page: "paging", hover: "dragging" },
  brushing: {
    release: "selected",
    clear: "idle",
    play: "playing",
    link: "linked",
    page: "paging",
    drag: "dragging",
  },
  selected: {
    brush: "brushing",
    clear: "idle",
    link: "linked",
    play: "playing",
    page: "paging",
    hover: "selected",
    drag: "dragging",
  },
  linked: { brush: "brushing", clear: "idle", play: "playing", page: "paging", hover: "linked" },
  playing: {
    stop: "idle",
    pause: "paused",
    brush: "brushing",
    page: "paging",
    hover: "playing",
  },
  paused: { play: "playing", stop: "idle", brush: "brushing", page: "paging", hover: "paused" },
  paging: {
    page: "paging",
    play: "playing",
    brush: "brushing",
    clear: "idle",
    link: "linked",
    hover: "hover",
  },
};

export function guardView(from: ViewPhase, event: ViewEvent): ViewPhase {
  return TRANSITIONS[from]?.[event] ?? from;
}

export function inferViewEvent(
  prev: ViewSnapshot | null,
  next: Omit<ViewSnapshot, "via">,
): ViewEvent | undefined {
  if (next.phase === "playing" && prev?.phase !== "playing") return "play";
  if (next.paused && !prev?.paused) return "pause";
  if (prev?.phase === "playing" && next.phase !== "playing" && !next.paused) return "stop";
  if (next.dragging && !prev?.dragging) return "drag";
  if (!next.dragging && prev?.dragging) return "drop";
  if (next.brushOn && !prev?.brushOn) return "brush";
  if (!next.brushOn && prev?.brushOn) return next.selN > 0 ? "release" : "clear";
  if (next.selN === 0 && (prev?.selN ?? 0) > 0) return "clear";
  if (next.linked && !prev?.linked) return "link";
  if (next.page !== (prev?.page ?? 0)) return "page";
  if (next.hoverOn && !prev?.hoverOn) return "hover";
  if (!next.hoverOn && prev?.hoverOn) return "leave";
  return undefined;
}

export function sampleView(
  state: Record<string, unknown>,
  opts: { playing?: boolean; hovering?: boolean; dragging?: boolean; paused?: boolean } = {},
): ViewSnapshot {
  const brush = asRecord(state.__brush);
  const sel = asRecord(state.__sel);
  const hover = asRecord(state.__hover);
  const selN = Number(sel?.n ?? 0) || 0;
  const brushOn = Boolean(brush?.on);
  const brushFrame = String(brush?.frame ?? "");
  const linked = selN > 0 && Boolean(brushFrame);
  const beat = Number(state.__beat ?? 0) || 0;
  const t = Number(state.__t ?? 0) || 0;
  const page = Number(state.__page ?? sel?.page ?? brush?.page ?? 0) || 0;
  const hoverOn = opts.hovering ?? Boolean(hover?.on ?? state.__hover);
  const dragging = Boolean(opts.dragging);
  const paused = Boolean(opts.paused);
  let phase: ViewPhase = "idle";
  if (opts.playing) phase = "playing";
  else if (paused) phase = "paused";
  else if (dragging) phase = "dragging";
  else if (brushOn) phase = "brushing";
  else if (linked) phase = "linked";
  else if (selN > 0) phase = "selected";
  else if (hoverOn) phase = "hover";
  const prev = asView(state.__view);
  const via = inferViewEvent(prev, {
    phase,
    beat,
    t,
    selN,
    brushOn,
    linked,
    page,
    hoverOn,
    dragging,
    paused,
  });
  if (prev && via) phase = guardView(prev.phase, via);
  if (phase === "paging" && prev && prev.phase !== "paging") phase = prev.phase;
  return { phase, beat, t, selN, brushOn, linked, page, hoverOn, dragging, paused, via };
}

export function applyViewState(
  state: Record<string, unknown>,
  opts: { playing?: boolean; hovering?: boolean; dragging?: boolean; paused?: boolean } = {},
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
  if (!PHASES.includes(phase as ViewPhase)) return null;
  return {
    phase: phase as ViewPhase,
    beat: Number(rec.beat ?? 0) || 0,
    t: Number(rec.t ?? 0) || 0,
    selN: Number(rec.selN ?? 0) || 0,
    brushOn: Boolean(rec.brushOn),
    linked: Boolean(rec.linked),
    page: Number(rec.page ?? 0) || 0,
    hoverOn: Boolean(rec.hoverOn),
    dragging: Boolean(rec.dragging),
    paused: Boolean(rec.paused),
    via: rec.via as ViewEvent | undefined,
  };
}
