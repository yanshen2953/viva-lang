/** Scene-node boxes for review, Runtime hit tests, and structural QA. */

import { estimateTextWidthPx } from "./chrome-collide.js";

export type NodeBBox = { x: number; y: number; w: number; h: number };

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function rotatePoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  deg: number,
): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

function aabbOf(points: { x: number; y: number }[]): NodeBBox {
  let x0 = points[0]!.x;
  let y0 = points[0]!.y;
  let x1 = x0;
  let y1 = y0;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: Math.max(1e-3, x1 - x0), h: Math.max(1e-3, y1 - y0) };
}

/**
 * Axis-aligned box for a painted node. Text uses CJK-aware px widths and
 * `rotate` around the anchor (SVG `rotate(deg x y)`). Callers that already
 * ran `scaleSceneGeom` stay in CSS px; unscaled IR stays in scene units
 * only if font and x/y share a unit (px scenes).
 */
export function propsToBBox(p: Record<string, unknown>): NodeBBox {
  const x = num(p.x);
  const y = num(p.y);
  if (
    p.r !== undefined ||
    (p.size !== undefined &&
      p.w === undefined &&
      p.width === undefined &&
      p.text === undefined &&
      p.label === undefined)
  ) {
    const r = num(p.r ?? p.size, 16);
    return { x: x - r, y: y - r, w: r * 2, h: r * 2 };
  }
  if (p.w !== undefined || p.width !== undefined || p.h !== undefined || p.height !== undefined) {
    return { x, y, w: num(p.w ?? p.width, 80), h: num(p.h ?? p.height, 24) };
  }
  if (p.x1 !== undefined) {
    const x1 = num(p.x1);
    const y1 = num(p.y1);
    const x2 = num(p.x2, x1 + 40);
    const y2 = num(p.y2, y1);
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1) || 1,
      h: Math.abs(y2 - y1) || 1,
    };
  }
  if (p.text !== undefined || p.label !== undefined || p.font !== undefined || p.fontSize !== undefined) {
    const text = String(p.text ?? p.label ?? "");
    const font = num(p.font ?? p.fontSize, 14);
    const tracking = num(p.letterSpacing ?? p.tracking, 0);
    const w = Math.max(estimateTextWidthPx(text, font, tracking), font * 2);
    const h = font * 1.4;
    const align = String(p.align ?? "start");
    const left =
      align === "center" || align === "middle"
        ? x - w / 2
        : align === "right" || align === "end"
          ? x - w
          : x;
    const top = y - font * 0.85;
    const rotate = num(p.rotate ?? p.rotation, 0);
    if (Math.abs(rotate) < 0.5) return { x: left, y: top, w, h };
    const corners = [
      { x: left, y: top },
      { x: left + w, y: top },
      { x: left + w, y: top + h },
      { x: left, y: top + h },
    ].map((pt) => rotatePoint(pt.x, pt.y, x, y, rotate));
    return aabbOf(corners);
  }
  return { x: x - 4, y: y - 4, w: 8, h: 8 };
}
