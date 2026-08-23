/** Default fade/scale for selection and highlight. No new language keywords — Runtime only. */
export const MARK_EASE_MS = 220;
export const MARK_EASE_CURVE = "cubic-bezier(0.22, 1, 0.36, 1)";
export const MARK_HIGHLIGHT_SCALE = 1.18;

export type MarkPaint = {
  display: string;
  opacity: number;
  pointerEvents: string;
  hideAfterMs: number | null;
  transform: string;
  transition: string;
};

/** Map IR visible+opacity+scale onto a paintable state that can ease instead of popping. */
export function markPaintState(visible: boolean, opacity: number, scale = 1): MarkPaint {
  const alpha = visible ? opacity : 0;
  const s = visible && Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    display: "",
    opacity: alpha,
    pointerEvents: visible ? "" : "none",
    hideAfterMs: visible ? null : MARK_EASE_MS,
    transform: s === 1 ? "none" : `scale(${s})`,
    transition: `opacity ${MARK_EASE_MS}ms ${MARK_EASE_CURVE}, transform ${MARK_EASE_MS}ms ${MARK_EASE_CURVE}`,
  };
}

export type MarkPaintEl = {
  style: {
    transition: string;
    transformBox: string;
    transformOrigin: string;
    transform: string;
    pointerEvents: string;
    display: string;
    opacity: string;
  };
  setAttribute(name: string, value: string): void;
};

/** Write CSS opacity/transform so the 220ms ease actually runs. SVG attr alone does not. */
export function applyMarkPaintCss(el: MarkPaintEl, paint: MarkPaint): void {
  el.style.transition = paint.transition;
  el.style.transformBox = "fill-box";
  el.style.transformOrigin = "center";
  el.style.transform = paint.transform;
  el.style.pointerEvents = paint.pointerEvents || "auto";
  el.style.display = paint.display;
  el.style.opacity = String(paint.opacity);
  el.setAttribute("opacity", String(paint.opacity));
}
