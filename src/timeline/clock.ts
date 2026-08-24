/** Beat clock for layout.board play. Plugin property, not a language keyword. */

export type TimelineSpec = {
  beats: number;
  holdSec: number;
  easeSec: number;
  fps: number;
  /** Per-beat hold seconds. Plugin property, not a keyword. */
  holds?: number[];
};

export type BeatSample = {
  t: number;
  beat: number;
  next: number;
  phase: "hold" | "ease";
  local: number;
  ease: number;
  cycleSec: number;
};

export function normalizeTimeline(
  raw: Partial<TimelineSpec> | Record<string, unknown> | undefined,
  beats: number,
): TimelineSpec {
  const n = Math.max(1, Math.floor(numberish(raw, "beats", beats)));
  const fps = Math.max(1, numberish(raw, "fps", 12));
  const easeSec = clamp(numberish(raw, "easeSec", numberish(raw, "ease", 0.22)), 0, 8);
  const holdSec = Math.max(0.05, numberish(raw, "holdSec", numberish(raw, "hold", 1.2)));
  const holds = numberList(raw, "holds").map((h) => Math.max(0.05, h));
  return { beats: n, holdSec, easeSec, fps, ...(holds.length ? { holds } : {}) };
}

export function holdOf(spec: TimelineSpec, beat: number): number {
  const i = ((beat % spec.beats) + spec.beats) % spec.beats;
  const named = spec.holds?.[i];
  return named != null && named > 0 ? named : spec.holdSec;
}

export function periodOf(spec: TimelineSpec, beat: number): number {
  return holdOf(spec, beat) + spec.easeSec;
}

export function startOfBeat(spec: TimelineSpec, beat: number): number {
  let t = 0;
  const n = Math.max(0, Math.floor(beat));
  for (let i = 0; i < n; i++) t += periodOf(spec, i);
  return t;
}

export function cycleSecOf(spec: TimelineSpec): number {
  return Math.max(0.05, startOfBeat(spec, spec.beats));
}

export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

export function sampleBeatAt(spec: TimelineSpec, t: number): BeatSample {
  const cycle = cycleSecOf(spec);
  const u = ((t % cycle) + cycle) % cycle;
  let acc = 0;
  let beat = spec.beats - 1;
  let localT = 0;
  let hold = spec.holdSec;
  for (let i = 0; i < spec.beats; i++) {
    const period = periodOf(spec, i);
    if (u < acc + period - 1e-12 || i === spec.beats - 1) {
      beat = i;
      localT = u - acc;
      hold = holdOf(spec, i);
      break;
    }
    acc += period;
  }
  const next = (beat + 1) % spec.beats;
  if (localT < hold || spec.easeSec <= 1e-9) {
    return {
      t: u,
      beat,
      next,
      phase: "hold",
      local: hold <= 1e-9 ? 1 : localT / hold,
      ease: 0,
      cycleSec: cycle,
    };
  }
  const local = (localT - hold) / spec.easeSec;
  return {
    t: u,
    beat,
    next,
    phase: "ease",
    local,
    ease: easeInOutCubic(local),
    cycleSec: cycle,
  };
}

/** 0 = this shot is live; 1 = fully veiled. */
export function veilOpacity(i: number, sample: BeatSample): number {
  if (sample.phase === "hold") return i === sample.beat ? 0 : 1;
  if (i === sample.beat) return sample.ease;
  if (i === sample.next) return 1 - sample.ease;
  return 1;
}

export function applyTimelineState(
  state: Record<string, unknown>,
  spec: TimelineSpec,
  t: number,
): BeatSample {
  const sample = sampleBeatAt(spec, t);
  state.__t = sample.t;
  state.__beat = sample.beat;
  for (let i = 0; i < spec.beats; i++) {
    state[`__veil${i}`] = veilOpacity(i, sample);
  }
  return sample;
}

export function holdFrameTimes(spec: TimelineSpec): number[] {
  return Array.from({ length: spec.beats }, (_, i) => startOfBeat(spec, i) + holdOf(spec, i) * 0.5);
}

export function playbackFrameTimes(spec: TimelineSpec): number[] {
  const cycle = cycleSecOf(spec);
  const fps = Math.max(1, spec.fps);
  const n = Math.max(spec.beats, Math.round(cycle * fps));
  const dt = cycle / n;
  return Array.from({ length: n }, (_, i) => i * dt);
}

export function timelineFromState(
  state: Record<string, unknown> | undefined,
): TimelineSpec | null {
  const raw = state?.__timeline;
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const beats = Number(rec.beats);
  if (!(beats > 1)) return null;
  return normalizeTimeline(rec, beats);
}

function numberish(
  raw: Partial<TimelineSpec> | Record<string, unknown> | undefined,
  key: string,
  fallback: number,
): number {
  if (!raw || typeof raw !== "object") return fallback;
  const v = (raw as Record<string, unknown>)[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function numberList(
  raw: Partial<TimelineSpec> | Record<string, unknown> | undefined,
  key: string,
): number[] {
  if (!raw || typeof raw !== "object") return [];
  const v = (raw as Record<string, unknown>)[key];
  if (!Array.isArray(v)) return [];
  return v.map((n) => Number(n)).filter((n) => Number.isFinite(n));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
