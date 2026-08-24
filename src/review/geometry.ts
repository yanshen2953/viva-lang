import type { ScenePoint, SelectionCombine, SelectionRegion, SelectedNode } from "./types.js";

export type BBox = { x: number; y: number; w: number; h: number };

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function pointInRect(p: ScenePoint, r: { x: number; y: number; w: number; h: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Ray-casting point-in-polygon (lasso / closed path). */
export function pointInPolygon(p: ScenePoint, poly: ScenePoint[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i]!;
    const pj = poly[j]!;
    const intersect =
      pi.y > p.y !== pj.y > p.y &&
      p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y + 1e-12) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Sample cubic Bezier segments: points are P0,C1,C2,P1,C1,C2,P2,... */
export function sampleBezier(points: ScenePoint[], stepsPerSeg = 16): ScenePoint[] {
  if (points.length < 4) return [...points];
  const out: ScenePoint[] = [];
  for (let i = 0; i + 3 < points.length; i += 3) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const p2 = points[i + 2]!;
    const p3 = points[i + 3]!;
    for (let s = 0; s <= stepsPerSeg; s++) {
      const t = s / stepsPerSeg;
      out.push(cubicAt(p0, p1, p2, p3, t));
    }
  }
  return out;
}

function cubicAt(p0: ScenePoint, p1: ScenePoint, p2: ScenePoint, p3: ScenePoint, t: number): ScenePoint {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

export function regionHitsNode(region: SelectionRegion, node: SelectedNode): boolean {
  const b = node.bbox;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const center = { x: cx, y: cy };
  switch (region.kind) {
    case "point":
      return pointInRect(region, b) || (Math.hypot(region.x - cx, region.y - cy) < 8);
    case "rect": {
      const r = normalizeRect(region);
      return bboxIntersects(b, r);
    }
    case "lasso":
      return pointInPolygon(center, region.points) || nodeCorners(b).some((c) => pointInPolygon(c, region.points));
    case "bezier": {
      const poly = sampleBezier(region.points);
      return pointInPolygon(center, poly) || nodeCorners(b).some((c) => pointInPolygon(c, poly));
    }
  }
}

function nodeCorners(b: BBox): ScenePoint[] {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
}

export function normalizeRect(r: { x: number; y: number; w: number; h: number }): BBox {
  const x = r.w < 0 ? r.x + r.w : r.x;
  const y = r.h < 0 ? r.y + r.h : r.y;
  return { x, y, w: Math.abs(r.w), h: Math.abs(r.h) };
}

export function combineSelection(
  current: SelectedNode[],
  next: SelectedNode[],
  mode: SelectionCombine,
): SelectedNode[] {
  const byId = new Map(current.map((n) => [n.id, n]));
  const nextIds = new Set(next.map((n) => n.id));
  if (mode === "replace") return dedupe(next);
  if (mode === "add") {
    for (const n of next) byId.set(n.id, n);
    return [...byId.values()];
  }
  if (mode === "subtract") {
    return current.filter((n) => !nextIds.has(n.id));
  }
  // intersect
  return current.filter((n) => nextIds.has(n.id));
}

export function invertSelection(all: SelectedNode[], current: SelectedNode[]): SelectedNode[] {
  const cur = new Set(current.map((n) => n.id));
  return all.filter((n) => !cur.has(n.id));
}

function dedupe(nodes: SelectedNode[]): SelectedNode[] {
  const m = new Map<string, SelectedNode>();
  for (const n of nodes) m.set(n.id, n);
  return [...m.values()];
}
