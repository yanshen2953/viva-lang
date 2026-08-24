/** Publication ticks: majors plus log / linear / time minors. Not a keyword. */

export function logMajorTicks(min: number, max: number): number[] {
  const lo = Math.max(min, 1e-12);
  const hi = Math.max(max, lo);
  const e0 = Math.ceil(Math.log10(lo) - 1e-9);
  const e1 = Math.floor(Math.log10(hi) + 1e-9);
  const ticks: number[] = [];
  for (let e = e0; e <= e1; e++) {
    const v = 10 ** e;
    if (v >= lo * 0.999 && v <= hi * 1.001) ticks.push(v);
  }
  if (!ticks.length) {
    ticks.push(lo);
    if (hi > lo * 1.01) ticks.push(hi);
  }
  return ticks;
}

/** 2–9 × 10ⁿ between decades. */
export function logMinorTicks(min: number, max: number): number[] {
  const lo = Math.max(min, 1e-12);
  const hi = Math.max(max, lo);
  const e0 = Math.floor(Math.log10(lo));
  const e1 = Math.ceil(Math.log10(hi));
  const out: number[] = [];
  for (let e = e0; e <= e1; e++) {
    for (const m of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const v = m * 10 ** e;
      if (v > lo * 1.001 && v < hi * 0.999) out.push(v);
    }
  }
  return out;
}

/** Four interior minors between each major pair. */
export function linearMinorTicks(majors: number[], min: number, max: number): number[] {
  if (majors.length < 2) return [];
  const sorted = [...majors].sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const step = (b - a) / 5;
    if (!(step > 0)) continue;
    for (let k = 1; k < 5; k++) {
      const v = a + step * k;
      if (v > min + step * 0.05 && v < max - step * 0.05) out.push(v);
    }
  }
  return out;
}

const DAY = 86_400_000;

export function timeMinorTicks(
  majors: { value: number }[],
  min: number, max: number,
): number[] {
  if (majors.length < 2) return [];
  const span = Math.max(1, max - min);
  const sorted = [...majors].sort((a, b) => a.value - b.value);
  const out: number[] = [];
  if (span > DAY * 800) {
    for (const m of sorted) {
      for (const month of [3, 6, 9]) {
        const d = new Date(m.value);
        const v = Date.UTC(d.getUTCFullYear(), month, 1);
        if (v > min && v < max && !sorted.some((t) => Math.abs(t.value - v) < DAY)) out.push(v);
      }
    }
    return out;
  }
  if (span > DAY * 45) {
    for (let i = 0; i < sorted.length - 1; i++) {
      const mid = (sorted[i]!.value + sorted[i + 1]!.value) / 2;
      if (mid > min && mid < max) out.push(mid);
    }
    return out;
  }
  const step = Math.max(DAY, (sorted[1]!.value - sorted[0]!.value) / 2);
  for (let i = 0; i < sorted.length - 1; i++) {
    const v = sorted[i]!.value + step;
    if (v > min && v < sorted[i + 1]!.value - DAY * 0.25) out.push(v);
  }
  return out;
}

export function niceScaleNumber(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const mag = 10 ** exp;
  const n = raw / mag;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * mag;
}
