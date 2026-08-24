/** Beat clock + edit track for layout.board play. Plugin properties, not keywords. */

export type TimelineSpec = {
  beats: number;
  holdSec: number;
  easeSec: number;
  fps: number;
  /** Per-beat hold seconds. Plugin property, not a keyword. */
  holds?: number[];
  /** Per-beat trim-in seconds on the source clip. */
  ins?: number[];
  /** Per-beat trim-out seconds on the source clip. */
  outs?: number[];
  /** Playlist order of source beats. */
  order?: number[];
  /** Cut marks on the master, seconds. */
  cuts?: number[];
  /** Track index per playlist slot. */
  tracks?: number[];
};

export type BeatSample = {
  t: number;
  beat: number;
  next: number;
  phase: "hold" | "ease";
  local: number;
  ease: number;
  cycleSec: number;
  track: number;
};

export type EditClip = {
  beat: number;
  inSec: number;
  outSec: number;
  track: number;
  start: number;
  duration: number;
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
  const ins = numberList(raw, "ins").map((h) => Math.max(0, h));
  const outs = numberList(raw, "outs").map((h) => Math.max(0, h));
  const order = numberList(raw, "order").map((h) => Math.floor(h));
  const cuts = numberList(raw, "cuts").map((h) => Math.max(0, h));
  const tracks = numberList(raw, "tracks").map((h) => Math.max(0, Math.floor(h)));
  return {
    beats: n,
    holdSec,
    easeSec,
    fps,
    ...(holds.length ? { holds } : {}),
    ...(ins.length ? { ins } : {}),
    ...(outs.length ? { outs } : {}),
    ...(order.length ? { order } : {}),
    ...(cuts.length ? { cuts } : {}),
    ...(tracks.length ? { tracks } : {}),
  };
}

export function playlistOf(spec: TimelineSpec): number[] {
  const n = Math.max(1, spec.beats);
  if (spec.order?.length) {
    return spec.order.map((i) => ((i % n) + n) % n);
  }
  return Array.from({ length: n }, (_, i) => i);
}

export function holdOf(spec: TimelineSpec, beat: number): number {
  const i = ((beat % spec.beats) + spec.beats) % spec.beats;
  const named = spec.holds?.[i];
  return named != null && named > 0 ? named : spec.holdSec;
}

export function clipDuration(spec: TimelineSpec, beat: number): number {
  const i = ((beat % spec.beats) + spec.beats) % spec.beats;
  const hold = holdOf(spec, i);
  const inSec = spec.ins?.[i] ?? 0;
  const outSec = spec.outs?.[i];
  if (outSec != null && outSec > inSec) return Math.max(0.05, outSec - inSec);
  return hold;
}

export function periodOf(spec: TimelineSpec, beat: number): number {
  return clipDuration(spec, beat) + spec.easeSec;
}

export function editTrackOf(spec: TimelineSpec): EditClip[] {
  const order = playlistOf(spec);
  let t = 0;
  return order.map((beat, slot) => {
    const inSec = spec.ins?.[beat] ?? 0;
    const duration = clipDuration(spec, beat);
    const clip: EditClip = {
      beat,
      inSec,
      outSec: inSec + duration,
      track: spec.tracks?.[slot] ?? spec.tracks?.[beat] ?? 0,
      start: t,
      duration,
    };
    t += duration + spec.easeSec;
    return clip;
  });
}

export function startOfBeat(spec: TimelineSpec, beat: number): number {
  if (spec.order?.length) {
    const order = playlistOf(spec);
    let t = 0;
    const target = Math.floor(beat);
    for (const b of order) {
      if (b === target) return t;
      t += periodOf(spec, b);
    }
    return t;
  }
  let t = 0;
  const n = Math.max(0, Math.floor(beat));
  for (let i = 0; i < n; i++) t += periodOf(spec, i);
  return t;
}

export function cycleSecOf(spec: TimelineSpec): number {
  const order = playlistOf(spec);
  return Math.max(
    0.05,
    order.reduce((sum, beat) => sum + periodOf(spec, beat), 0),
  );
}

export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

export function sampleBeatAt(spec: TimelineSpec, t: number): BeatSample {
  const cycle = cycleSecOf(spec);
  const u = ((t % cycle) + cycle) % cycle;
  const order = playlistOf(spec);
  let acc = 0;
  let beat = order[order.length - 1] ?? spec.beats - 1;
  let next = order[0] ?? 0;
  let localT = 0;
  let hold = spec.holdSec;
  let track = 0;
  for (let slot = 0; slot < order.length; slot++) {
    const src = order[slot]!;
    const period = periodOf(spec, src);
    if (u < acc + period - 1e-12 || slot === order.length - 1) {
      beat = src;
      next = order[(slot + 1) % order.length]!;
      localT = u - acc;
      hold = clipDuration(spec, src);
      track = spec.tracks?.[slot] ?? spec.tracks?.[src] ?? 0;
      break;
    }
    acc += period;
  }
  if (localT < hold || spec.easeSec <= 1e-9) {
    return {
      t: u,
      beat,
      next,
      phase: "hold",
      local: hold <= 1e-9 ? 1 : localT / hold,
      ease: 0,
      cycleSec: cycle,
      track,
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
    track,
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
  state.__track = sample.track;
  for (let i = 0; i < spec.beats; i++) {
    state[`__veil${i}`] = veilOpacity(i, sample);
  }
  return sample;
}

export function holdFrameTimes(spec: TimelineSpec): number[] {
  return playlistOf(spec).map((beat) => startOfBeat(spec, beat) + clipDuration(spec, beat) * 0.5);
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
