/**
 * R4-A / R4-B: hit-test 1 px inside vs outside, and Clock __t matching export.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileSource } from "../../src/pipeline.js";
import { flattenNodesFromIr, renderSvgFromIr } from "../../src/export/static-svg.js";
import { propsToBBox, pointHitsBox } from "../../src/layout/node-bbox.js";
import {
  applyTimelineState,
  holdFrameTimes,
  playbackFrameTimes,
  sampleBeatAt,
  editTrackOf,
} from "../../src/timeline/clock.js";
import { constrainAgainst, overlapsSolid } from "../../src/runtime/hand.js";

const PRINT = { handbookIds: ["print-nature"] } as const;

describe("R4-A input stack", () => {
  it("hits 1 px inside a mark and misses 1 px outside", () => {
    const compiled = compileSource(
      `artifact Hit
data rows = [{ x: 2, y: 3 }]
scene
  size: 200 160
  background: #ffffff
widget chart.scatter
  data: rows
  xField: x
  yField: y
  xlim: 0 4
  ylim: 0 5
  interactive: false
`,
      "hit.viva",
      PRINT,
    );
    expect(compiled.error, compiled.error ?? "").toBeNull();
    const mark = flattenNodesFromIr(compiled.ir!).nodes.find((n) => /mark|dot|point/i.test(n.name));
    expect(mark, "named mark").toBeTruthy();
    const box = propsToBBox(mark!.props);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    expect(pointHitsBox(cx, cy, box), `${mark!.name} center`).toBe(true);
    expect(pointHitsBox(box.x + 1, box.y + 1, box), `${mark!.name} inside`).toBe(true);
    expect(pointHitsBox(box.x - 1, box.y + box.h / 2, box), `${mark!.name} left-out`).toBe(false);
    expect(pointHitsBox(box.x + box.w + 1, box.y + box.h / 2, box), `${mark!.name} right-out`).toBe(false);
  });

  it("starts a brush from the mark or empty ground with the same box test", () => {
    const box = { x: 40, y: 40, w: 20, h: 20 };
    expect(pointHitsBox(50, 50, box)).toBe(true);
    expect(pointHitsBox(10, 10, box)).toBe(false);
    const fromMark = { kind: "circle" as const, x: 50, y: 50, r: 4 };
    const fromEmpty = { kind: "circle" as const, x: 10, y: 10, r: 4 };
    const wall = { kind: "rect" as const, x: 80, y: 30, w: 10, h: 40 };
    expect(overlapsSolid(fromMark, wall)).toBe(false);
    expect(overlapsSolid(fromEmpty, wall)).toBe(false);
  });

  it("sweeps into a wall and slides instead of tunneling", () => {
    const from = { kind: "circle" as const, x: 20, y: 40, r: 8 };
    const to = { kind: "circle" as const, x: 120, y: 40, r: 8 };
    const wall = { kind: "rect" as const, x: 60, y: 20, w: 12, h: 40 };
    const got = constrainAgainst(to, [wall], from);
    expect(got.blocked).toBe(true);
    expect(got.x).toBeLessThan(60);
  });
});

describe("R4-B clock fidelity", () => {
  it("samples the same beat at a hold time for runtime state and static export", () => {
    const src = readFileSync("examples/storyboard.viva", "utf8");
    const compiled = compileSource(src, "storyboard.viva");
    expect(compiled.error, compiled.error ?? "").toBeNull();
    const spec = compiled.ir!.timeline!;
    const t = holdFrameTimes(spec)[1]!;
    const sample = sampleBeatAt(spec, t);
    const state = { ...(compiled.ir!.state as Record<string, unknown>) };
    applyTimelineState(state, spec, t);
    expect(state.__t).toBeCloseTo(t, 5);
    expect(state.__beat).toBe(sample.beat);
    const ir = structuredClone(compiled.ir!);
    ir.state = state;
    const svg = renderSvgFromIr(ir);
    expect(svg).toMatch(/opacity=/);
    expect(playbackFrameTimes(spec).some((x) => Math.abs(x - t) < 1e-6 || x > t)).toBe(true);
  });

  it("builds an edit track from holds/ins/outs/order/cuts/tracks", () => {
    const spec = {
      beats: 3,
      holdSec: 1,
      easeSec: 0.2,
      fps: 10,
      holds: [1.2, 0.4, 2],
      ins: [0, 0.1, 0],
      outs: [1, 0.8, 1],
      order: [2, 0, 1],
      cuts: [0, 2.5],
      tracks: [0, 1, 0],
    };
    const track = editTrackOf(spec);
    expect(track.length).toBeGreaterThan(0);
    expect(track.map((c) => c.beat)).toContain(2);
    expect(sampleBeatAt(spec, 0.1).beat).toBe(2);
  });
});
