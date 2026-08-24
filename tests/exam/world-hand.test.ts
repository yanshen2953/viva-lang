import { describe, expect, it } from "vitest";
import {
  centerInRect,
  classifyContacts,
  constrainAgainst,
  contactNormal,
  movedPastSlop,
  overlapsSolid,
  pairKey,
  penetration,
  selectClick,
  lassoRect,
  sharedShift,
  slideOut,
  sweepTime,
} from "../../src/runtime/hand.js";

describe("world hand", () => {
  it("does not treat a tap as a drag", () => {
    expect(movedPastSlop(1, 1)).toBe(false);
    expect(movedPastSlop(4, 0)).toBe(true);
  });

  it("replaces or additive-toggles grip ids", () => {
    expect(selectClick(["a"], "b", false)).toEqual(["b"]);
    expect(selectClick(["a"], "b", true)).toEqual(["a", "b"]);
    expect(selectClick(["a", "b"], "a", true)).toEqual(["b"]);
  });

  it("classifies collide enter / stay / leave", () => {
    const phases = classifyContacts(["a|b"], ["a|b", "a|c"]);
    expect(phases.enter).toEqual(["a|c"]);
    expect(phases.stay).toEqual(["a|b"]);
    expect(classifyContacts(["a|b"], []).leave).toEqual(["a|b"]);
    expect(pairKey("b", "a")).toBe("a|b");
  });

  it("treats a tangent pair as touching, not sunk", () => {
    const self = { kind: "circle" as const, x: 100, y: 80, r: 20 };
    const wall = { kind: "circle" as const, x: 140, y: 80, r: 20 };
    expect(penetration(self, wall)).toBeCloseTo(0);
    expect(overlapsSolid(self, wall)).toBe(false);
  });

  it("blocks a circle from sinking into another", () => {
    const self = { kind: "circle" as const, x: 120, y: 80, r: 20 };
    const wall = { kind: "circle" as const, x: 140, y: 80, r: 20 };
    expect(penetration(self, wall)).toBeGreaterThan(0);
    expect(overlapsSolid(self, wall)).toBe(true);
    const { nx } = contactNormal(self, wall);
    expect(nx).toBeLessThan(0);
    const out = slideOut(self, wall);
    const cleared = { ...self, x: out.x, y: out.y };
    expect(penetration(cleared, wall)).toBeLessThanOrEqual(1e-6);
  });

  it("slides a proposed drag against obstacles", () => {
    const proposed = { kind: "circle" as const, x: 120, y: 80, r: 20 };
    const wall = { kind: "circle" as const, x: 140, y: 80, r: 20 };
    const got = constrainAgainst(proposed, [wall]);
    expect(got.blocked).toBe(true);
    expect(penetration({ ...proposed, x: got.x, y: got.y }, wall)).toBeLessThanOrEqual(1e-6);
  });

  it("sweeps a long step so a body cannot tunnel through a post", () => {
    const from = { kind: "circle" as const, x: 80, y: 80, r: 20 };
    const proposed = { kind: "circle" as const, x: 200, y: 80, r: 20 };
    const wall = { kind: "circle" as const, x: 140, y: 80, r: 20 };
    expect(overlapsSolid(from, wall)).toBe(false);
    expect(overlapsSolid(proposed, wall)).toBe(false);
    const t = sweepTime(from, proposed, wall);
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThan(0);
    expect(t!).toBeLessThan(1);
    const got = constrainAgainst(proposed, [wall], from);
    expect(got.blocked).toBe(true);
    expect(got.x).toBeLessThan(from.x + 40);
    expect(penetration({ ...proposed, x: got.x, y: got.y }, wall)).toBeLessThanOrEqual(1e-6);
  });

  it("keeps the tangent when a drag glances a post", () => {
    const from = { kind: "circle" as const, x: 80, y: 80, r: 20 };
    const proposed = { kind: "circle" as const, x: 160, y: 150, r: 20 };
    const wall = { kind: "circle" as const, x: 140, y: 80, r: 20 };
    const got = constrainAgainst(proposed, [wall], from);
    expect(got.blocked).toBe(true);
    expect(got.y).toBeGreaterThan(from.y + 30);
    expect(got.x).toBeLessThan(proposed.x);
    expect(penetration({ ...proposed, x: got.x, y: got.y }, wall)).toBeLessThanOrEqual(1e-6);
  });

  it("keeps a squad on one shared step", () => {
    const a = { kind: "circle" as const, x: 80, y: 80, r: 20 };
    const b = { kind: "circle" as const, x: 80, y: 160, r: 20 };
    const wall = { kind: "circle" as const, x: 200, y: 80, r: 20 };
    const step = sharedShift([a, b], 150, 0, [wall]);
    expect(step.dx).toBeLessThan(150);
    expect(step.dx).toBeGreaterThan(0);
    expect(step.dy).toBe(0);
    const a2 = { ...a, x: a.x + step.dx, y: a.y + step.dy };
    const b2 = { ...b, x: b.x + step.dx, y: b.y + step.dy };
    expect(b2.x - a2.x).toBeCloseTo(0);
    expect(b2.y - a2.y).toBeCloseTo(80);
    expect(penetration(a2, wall)).toBeLessThanOrEqual(1e-6);
  });

  it("lasso-tests a body center against a scene rect", () => {
    const ball = { kind: "circle" as const, x: 80, y: 80, r: 20 };
    expect(centerInRect(ball, { x0: 60, y0: 60, x1: 120, y1: 120 })).toBe(true);
    expect(centerInRect(ball, { x0: 200, y0: 200, x1: 240, y1: 240 })).toBe(false);
    expect(lassoRect(120, 40, 20, 100)).toEqual({ x: 20, y: 40, w: 100, h: 60 });
  });
});
