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
