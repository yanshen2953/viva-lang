import { describe, expect, it } from "vitest";
import { mmToPx } from "../../src/space/scene-box.js";
import { propsToSceneShape } from "../../src/runtime/units.js";
import { nodeIgnoresPointer } from "../../src/runtime/pointer.js";
import { sharedShift, penetration } from "../../src/runtime/hand.js";
import { compileSource } from "../../src/pipeline.js";
import { readFileSync } from "node:fs";

describe("runtime scene units", () => {
  it("converts viewBox px props back to mm before collision", () => {
    const scale = mmToPx(1);
    const a = propsToSceneShape({ x: 20 * scale, y: 30 * scale, r: 3.2 * scale }, scale);
    expect(a.kind).toBe("circle");
    if (a.kind !== "circle") return;
    expect(a.x).toBeCloseTo(20);
    expect(a.y).toBeCloseTo(30);
    expect(a.r).toBeCloseTo(3.2);
    const wall = propsToSceneShape({ x: 40 * scale, y: 30 * scale, w: 10 * scale, h: 10 * scale }, scale);
    const step = sharedShift([a], 30, 0, [wall]);
    expect(step.dx).toBeLessThan(30);
    expect(penetration({ ...a, x: a.x + step.dx, y: a.y + step.dy }, wall)).toBeLessThanOrEqual(1e-6);
  });

  it("ignores page jump / chapter chrome", () => {
    expect(nodeIgnoresPointer("__page_jump_2")).toBe(true);
    expect(nodeIgnoresPointer("__page_chapter_1")).toBe(true);
    expect(nodeIgnoresPointer("__page_folio_1")).toBe(true);
    expect(nodeIgnoresPointer("plotA_plotBg")).toBe(false);
  });

  it("arrival fixture compiles with World tokens, brush frames, beats and two pages", () => {
    const src = readFileSync("examples/arrival.viva", "utf8");
    expect(src).not.toMatch(/(^|\n)\s*(areaX|areaY|insetL|plotPad)\s*:/);
    const result = compileSource(src, "arrival.viva", { handbookIds: ["print-nature"] });
    expect(result.error, result.error ?? "").toBeNull();
    const ir = result.ir!;
    expect(ir.events.some((e) => e.type === "drag" && e.target === "tokens")).toBe(true);
    expect(ir.events.some((e) => e.type === "collide" && e.target === "tokens")).toBe(true);
    expect(ir.timeline?.beats).toBe(4);
    expect(Object.keys(ir.state)).toContain("__beat");
    expect(ir.frames.some((f) => f.name === "a" || f.name.endsWith("_a"))).toBe(true);
  });
});
