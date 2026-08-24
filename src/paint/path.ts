/** SVG path tokenize / bbox / rewrite. Shared by PDF paint and node boxes. */

export type PathPoint = { x: number; y: number };

const NUM = /[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g;
const CMD = /[MmLlHhVvCcSsQqTtAaZz]/;

export function tokenizePath(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    if (m[1]) out.push(m[1]);
    else if (m[2]) out.push(Number(m[2]));
  }
  return out;
}

function take(tokens: (string | number)[], i: { n: number }): number {
  const v = tokens[i.n];
  i.n += 1;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Flatten a path to sample points (curve controls + endpoints). Enough for AABB. */
export function pathPoints(d: string): PathPoint[] {
  const tokens = tokenizePath(d);
  const pts: PathPoint[] = [];
  let i = { n: 0 };
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = "M";
  while (i.n < tokens.length) {
    const raw = tokens[i.n];
    if (typeof raw === "string" && CMD.test(raw)) {
      cmd = raw;
      i.n += 1;
    }
    const rel = cmd === cmd.toLowerCase();
    const op = cmd.toUpperCase();
    if (op === "Z") {
      x = sx;
      y = sy;
      pts.push({ x, y });
      continue;
    }
    if (op === "M" || op === "L") {
      const nx = take(tokens, i);
      const ny = take(tokens, i);
      x = rel ? x + nx : nx;
      y = rel ? y + ny : ny;
      if (op === "M") {
        sx = x;
        sy = y;
        cmd = rel ? "l" : "L";
      }
      pts.push({ x, y });
      continue;
    }
    if (op === "H") {
      const nx = take(tokens, i);
      x = rel ? x + nx : nx;
      pts.push({ x, y });
      continue;
    }
    if (op === "V") {
      const ny = take(tokens, i);
      y = rel ? y + ny : ny;
      pts.push({ x, y });
      continue;
    }
    if (op === "C") {
      const x1 = take(tokens, i);
      const y1 = take(tokens, i);
      const x2 = take(tokens, i);
      const y2 = take(tokens, i);
      const nx = take(tokens, i);
      const ny = take(tokens, i);
      const p1 = { x: rel ? x + x1 : x1, y: rel ? y + y1 : y1 };
      const p2 = { x: rel ? x + x2 : x2, y: rel ? y + y2 : y2 };
      x = rel ? x + nx : nx;
      y = rel ? y + ny : ny;
      pts.push(p1, p2, { x, y });
      continue;
    }
    if (op === "S") {
      const x2 = take(tokens, i);
      const y2 = take(tokens, i);
      const nx = take(tokens, i);
      const ny = take(tokens, i);
      const p2 = { x: rel ? x + x2 : x2, y: rel ? y + y2 : y2 };
      x = rel ? x + nx : nx;
      y = rel ? y + ny : ny;
      pts.push(p2, { x, y });
      continue;
    }
    if (op === "Q") {
      const x1 = take(tokens, i);
      const y1 = take(tokens, i);
      const nx = take(tokens, i);
      const ny = take(tokens, i);
      const p1 = { x: rel ? x + x1 : x1, y: rel ? y + y1 : y1 };
      x = rel ? x + nx : nx;
      y = rel ? y + ny : ny;
      pts.push(p1, { x, y });
      continue;
    }
    if (op === "T") {
      const nx = take(tokens, i);
      const ny = take(tokens, i);
      x = rel ? x + nx : nx;
      y = rel ? y + ny : ny;
      pts.push({ x, y });
      continue;
    }
    if (op === "A") {
      take(tokens, i);
      take(tokens, i);
      take(tokens, i);
      take(tokens, i);
      take(tokens, i);
      const nx = take(tokens, i);
      const ny = take(tokens, i);
      x = rel ? x + nx : nx;
      y = rel ? y + ny : ny;
      pts.push({ x, y });
      continue;
    }
    i.n += 1;
  }
  return pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

export function pathBBox(d: string): { x: number; y: number; w: number; h: number } | null {
  const pts = pathPoints(d);
  if (!pts.length) return null;
  let x0 = pts[0]!.x;
  let y0 = pts[0]!.y;
  let x1 = x0;
  let y1 = y0;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: Math.max(1e-3, x1 - x0), h: Math.max(1e-3, y1 - y0) };
}

export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rad <= 0) return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
  return [
    `M ${x + rad} ${y}`,
    `H ${x + w - rad}`,
    `Q ${x + w} ${y} ${x + w} ${y + rad}`,
    `V ${y + h - rad}`,
    `Q ${x + w} ${y + h} ${x + w - rad} ${y + h}`,
    `H ${x + rad}`,
    `Q ${x} ${y + h} ${x} ${y + h - rad}`,
    `V ${y + rad}`,
    `Q ${x} ${y} ${x + rad} ${y} Z`,
  ].join(" ");
}

void NUM;
