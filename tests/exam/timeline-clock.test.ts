import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { simulate } from "../../src/simulate.js";
import {
  applyTimelineState,
  holdFrameTimes,
  playbackFrameTimes,
  sampleBeatAt,
  startOfBeat,
  veilOpacity,
} from "../../src/timeline/clock.js";
import { renderSvgFromIr } from "../../src/export/static-svg.js";

describe("beat clock", () => {
  const spec = { beats: 4, holdSec: 0.8, easeSec: 0.22, fps: 12 };

  it("holds then eases to the next beat", () => {
    const hold = sampleBeatAt(spec, 0.4);
    expect(hold.phase).toBe("hold");
    expect(hold.beat).toBe(0);
    expect(veilOpacity(0, hold)).toBe(0);
    expect(veilOpacity(1, hold)).toBe(1);
    const ease = sampleBeatAt(spec, 0.8 + 0.11);
    expect(ease.phase).toBe("ease");
    expect(ease.beat).toBe(0);
    expect(veilOpacity(0, ease)).toBeGreaterThan(0.2);
    expect(veilOpacity(0, ease)).toBeLessThan(0.8);
    expect(veilOpacity(0, ease) + veilOpacity(1, ease)).toBeCloseTo(1);
  });

  it("writes __t / __beat / __veilN together", () => {
    const state: Record<string, unknown> = {};
    applyTimelineState(state, spec, spec.holdSec + spec.easeSec + 0.01);
    expect(state.__beat).toBe(1);
    expect(state.__veil1).toBe(0);
    expect(state.__veil0).toBe(1);
  });

  it("compiles storyboard play onto a real clock, not an increment tick", () => {
    const src = readFileSync("examples/storyboard.viva", "utf8");
    const result = compileSource(src, "storyboard.viva");
    expect(result.error).toBeNull();
    expect(result.ir!.timeline?.beats).toBe(4);
    expect(result.ir!.ticks.some((t) => JSON.stringify(t.body).includes("__beat"))).toBe(false);
    const mid = simulate(result.ir!, { ticks: 1 });
    expect(mid.state.__beat).toBe(1);
    expect(mid.state.__view).toMatchObject({ phase: "playing", beat: 1 });
  });

  it("static SVG samples veil opacity from the clock", () => {
    const src = readFileSync("examples/storyboard.viva", "utf8");
    const result = compileSource(src, "storyboard.viva");
    const ir = structuredClone(result.ir!);
    applyTimelineState(ir.state as Record<string, unknown>, ir.timeline!, ir.timeline!.holdSec + 0.05);
    const svg = renderSvgFromIr(ir);
    expect(svg).toMatch(/opacity="0\./);
    expect(holdFrameTimes(ir.timeline!).length).toBe(4);
    expect(playbackFrameTimes(ir.timeline!).length).toBeGreaterThan(4);
  });

  it("honors per-beat holds without a new keyword", () => {
    const uneven = { beats: 3, holdSec: 1, easeSec: 0.2, fps: 10, holds: [1.2, 0.4, 2] };
    expect(startOfBeat(uneven, 1)).toBeCloseTo(1.4);
    expect(sampleBeatAt(uneven, 1.5).beat).toBe(1);
    expect(sampleBeatAt(uneven, 1.5).phase).toBe("hold");
    expect(holdFrameTimes(uneven)[1]).toBeCloseTo(1.4 + 0.2);
    expect(sampleBeatAt(uneven, 2.0).beat).toBe(2);
  });
});
