/** Scene-space violin KDE. Shared by compile-time expand and __sel recompute. */

export type ViolinYScale = "linear" | "log" | "band" | "time";

function linearInterp(
  value: number,
  domain: [number, number],
  range: [number, number],
  invert: boolean,
): number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const t = d1 === d0 ? 0 : (value - d0) / (d1 - d0);
  const mapped = r0 + t * (r1 - r0);
  return invert ? r0 + r1 - mapped : mapped;
}

/** Linear/log y map for violin paths. Avoids importing space.ts (cycle). */
export function mapViolinY(
  value: number,
  domain: [number, number],
  range: [number, number],
  invert: boolean,
  kind: ViolinYScale | string,
): number {
  if (kind === "log" || kind === "logarithmic") {
    const d0 = Math.log(Math.max(domain[0], 1e-12));
    const d1 = Math.log(Math.max(domain[1], 1e-12));
    const v = Math.log(Math.max(value, 1e-12));
    return linearInterp(v, [d0, d1], range, invert);
  }
  return linearInterp(value, domain, range, invert);
}

export function gaussianKDE(values: number[], y0: number, y1: number, n: number): number[] {
  const span = y1 - y0 || 1;
  const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
  const variance =
    values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / Math.max(1, values.length);
  const std = Math.sqrt(variance) || span / 8;
  const h = Math.max(span / 28, 0.85 * std * Math.pow(Math.max(1, values.length), -0.2));
  const dens: number[] = [];
  for (let i = 0; i < n; i++) {
    const y = y0 + (i / Math.max(1, n - 1)) * span;
    let s = 0;
    for (const v of values) {
      const u = (y - v) / h;
      s += Math.exp(-0.5 * u * u);
    }
    dens.push(s);
  }
  if (dens.length) {
    dens[0] = 0;
    dens[dens.length - 1] = 0;
  }
  return dens;
}

export function violinPathD(
  cx: number,
  dens: number[],
  y0: number,
  y1: number,
  py0: number,
  py1: number,
  yScale: ViolinYScale | string,
  halfMax: number,
): string {
  const n = dens.length;
  const peak = Math.max(...dens, 1e-9);
  const right: string[] = [];
  const left: string[] = [];
  for (let i = 0; i < n; i++) {
    const yVal = y0 + (i / Math.max(1, n - 1)) * (y1 - y0);
    const sy = mapViolinY(yVal, [y0, y1], [py0, py1], true, yScale);
    const w = (dens[i]! / peak) * halfMax;
    right.push(`${(cx + w).toFixed(2)},${sy.toFixed(2)}`);
    left.push(`${(cx - w).toFixed(2)},${sy.toFixed(2)}`);
  }
  return `M ${right[0]} L ${right.slice(1).join(" L ")} L ${left
    .slice()
    .reverse()
    .join(" L ")} Z`;
}
