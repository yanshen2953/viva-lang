import type { HandShape } from "./hand.js";

/** Flattened node props are viewBox px. Hand / collide stay in author scene units. */
export function propsToSceneShape(
  props: Record<string, unknown>,
  scale: number,
  origin?: { x: number; y: number },
): HandShape {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const x = origin?.x ?? num(props.x) / s;
  const y = origin?.y ?? num(props.y) / s;
  if (
    props.w !== undefined ||
    props.width !== undefined ||
    props.h !== undefined ||
    props.height !== undefined
  ) {
    return {
      kind: "rect",
      x,
      y,
      w: num(props.w ?? props.width, 80) / s,
      h: num(props.h ?? props.height, 24) / s,
    };
  }
  return {
    kind: "circle",
    x,
    y,
    r: num(props.r ?? props.size, 16) / s,
  };
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
