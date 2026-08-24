/**
 * World hand: grip, slop, contact phases, and non-penetration.
 * Runtime state, not a language keyword.
 */

export const DRAG_SLOP = 3;

export type HandShape =
  | { kind: "circle"; x: number; y: number; r: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number };

export type ContactPhase = "enter" | "stay" | "leave";

export type ContactPair = { key: string; a: string; b: string };

export type HandState = {
  ids: string[];
  held: string;
  n: number;
  phase: ContactPhase | "";
};

export function emptyHand(): HandState {
  return { ids: [], held: "", n: 0, phase: "" };
}

export function readHand(state: Record<string, unknown>): HandState {
  const raw = state.__hand;
  if (!raw || typeof raw !== "object") return emptyHand();
  const rec = raw as Record<string, unknown>;
  const ids = Array.isArray(rec.ids) ? rec.ids.map((id) => String(id)) : [];
  return {
    ids,
    held: String(rec.held ?? ""),
    n: ids.length,
    phase: rec.phase === "enter" || rec.phase === "stay" || rec.phase === "leave" ? rec.phase : "",
  };
}

export function writeHand(state: Record<string, unknown>, hand: HandState): HandState {
  const next = { ...hand, n: hand.ids.length };
  state.__hand = next;
  return next;
}

export function movedPastSlop(dx: number, dy: number, slop = DRAG_SLOP): boolean {
  return Math.hypot(dx, dy) > slop;
}

export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

export function selectClick(ids: string[], id: string, additive: boolean): string[] {
  if (!id) return additive ? ids : [];
  if (additive) return toggleId(ids, id);
  return [id];
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function classifyContacts(
  prev: Iterable<string>,
  next: Iterable<string>,
): { enter: string[]; stay: string[]; leave: string[] } {
  const before = new Set(prev);
  const after = new Set(next);
  const enter: string[] = [];
  const stay: string[] = [];
  const leave: string[] = [];
  for (const key of after) {
    if (before.has(key)) stay.push(key);
    else enter.push(key);
  }
  for (const key of before) {
    if (!after.has(key)) leave.push(key);
  }
  return { enter, stay, leave };
}

export function shapeCenter(shape: HandShape): { x: number; y: number } {
  if (shape.kind === "circle") return { x: shape.x, y: shape.y };
  return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 };
}

export function penetration(a: HandShape, b: HandShape): number {
  if (a.kind === "circle" && b.kind === "circle") {
    return a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y);
  }
  const ar = a.kind === "rect" ? a : circleToRect(a);
  const br = b.kind === "rect" ? b : circleToRect(b);
  const overlapX = Math.min(ar.x + ar.w, br.x + br.w) - Math.max(ar.x, br.x);
  const overlapY = Math.min(ar.y + ar.h, br.y + br.h) - Math.max(ar.y, br.y);
  if (overlapX <= 0 || overlapY <= 0) return -Math.hypot(Math.min(0, overlapX), Math.min(0, overlapY));
  return Math.min(overlapX, overlapY);
}

export function overlapsSolid(a: HandShape, b: HandShape, pad = 0): boolean {
  return penetration(a, b) > pad;
}

export function contactNormal(a: HandShape, b: HandShape): { nx: number; ny: number } {
  const ca = shapeCenter(a);
  const cb = shapeCenter(b);
  let nx = ca.x - cb.x;
  let ny = ca.y - cb.y;
  const len = Math.hypot(nx, ny);
  if (len < 1e-6) return { nx: 1, ny: 0 };
  return { nx: nx / len, ny: ny / len };
}

/** Move `self` so it no longer sinks into `wall`. Touches, does not pass through. */
export function slideOut(self: HandShape, wall: HandShape): { x: number; y: number } {
  const depth = penetration(self, wall);
  if (depth <= 0) return { x: self.x, y: self.y };
  const { nx, ny } = contactNormal(self, wall);
  return { x: self.x + nx * depth, y: self.y + ny * depth };
}

/**
 * First time along `from` → `to` that `wall` is hit, or null.
 * Already overlapping at `from` returns null so slideOut can unstick.
 */
export function sweepTime(from: HandShape, to: HandShape, wall: HandShape): number | null {
  if (from.kind === "circle" && to.kind === "circle" && wall.kind === "circle") {
    return sweepCircles(from, to, wall);
  }
  return sweepAabb(asRect(from), asRect(to), asRect(wall));
}

export function constrainAgainst(
  self: HandShape,
  obstacles: HandShape[],
  from?: HandShape,
): { x: number; y: number; blocked: boolean } {
  let next: HandShape = { ...self };
  let blocked = false;
  if (from) {
    let best = 1;
    let hit = false;
    for (const wall of obstacles) {
      const t = sweepTime(from, self, wall);
      if (t == null || t > best) continue;
      best = t;
      hit = true;
    }
    if (hit) {
      next = {
        ...self,
        x: from.x + (self.x - from.x) * best,
        y: from.y + (self.y - from.y) * best,
      };
      blocked = true;
    }
  }
  for (let i = 0; i < 4; i++) {
    let hit = false;
    for (const wall of obstacles) {
      if (penetration(next, wall) > 0) {
        const pos = slideOut(next, wall);
        next = { ...next, x: pos.x, y: pos.y };
        blocked = true;
        hit = true;
      }
    }
    if (!hit) break;
  }
  return { x: next.x, y: next.y, blocked };
}

export function centerInRect(
  shape: HandShape,
  box: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  const c = shapeCenter(shape);
  const x0 = Math.min(box.x0, box.x1);
  const x1 = Math.max(box.x0, box.x1);
  const y0 = Math.min(box.y0, box.y1);
  const y1 = Math.max(box.y0, box.y1);
  return c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1;
}

function circleToRect(c: Extract<HandShape, { kind: "circle" }>): Extract<HandShape, { kind: "rect" }> {
  return { kind: "rect", x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2 };
}

function asRect(shape: HandShape): Extract<HandShape, { kind: "rect" }> {
  return shape.kind === "rect" ? shape : circleToRect(shape);
}

function sweepCircles(
  from: Extract<HandShape, { kind: "circle" }>,
  to: Extract<HandShape, { kind: "circle" }>,
  wall: Extract<HandShape, { kind: "circle" }>,
): number | null {
  const r = from.r + wall.r;
  const fx = from.x - wall.x;
  const fy = from.y - wall.y;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - r * r;
  if (c < -1e-8) return null;
  if (Math.abs(c) <= 1e-8) return fx * dx + fy * dy < 0 ? 0 : null;
  if (a < 1e-16) return null;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > 1) return null;
  return t;
}

function sweepAabb(
  from: Extract<HandShape, { kind: "rect" }>,
  to: Extract<HandShape, { kind: "rect" }>,
  wall: Extract<HandShape, { kind: "rect" }>,
): number | null {
  const minX = wall.x - from.w;
  const minY = wall.y - from.h;
  const maxX = wall.x + wall.w;
  const maxY = wall.y + wall.h;
  return rayAabb(from.x, from.y, to.x - from.x, to.y - from.y, minX, minY, maxX, maxY);
}

function rayAabb(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): number | null {
  let tEnter = 0;
  let tLeave = 1;
  const slab = (origin: number, dir: number, min: number, max: number): boolean => {
    if (Math.abs(dir) < 1e-12) return origin >= min && origin <= max;
    const t1 = (min - origin) / dir;
    const t2 = (max - origin) / dir;
    tEnter = Math.max(tEnter, Math.min(t1, t2));
    tLeave = Math.min(tLeave, Math.max(t1, t2));
    return tEnter <= tLeave;
  };
  if (!slab(ox, dx, minX, maxX) || !slab(oy, dy, minY, maxY)) return null;
  if (tEnter > 1 || tLeave < 0) return null;
  if (tEnter <= 0) return null;
  return tEnter;
}
