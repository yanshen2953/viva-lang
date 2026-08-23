/** Default fade for selection hide/show. No new language keywords — Runtime only. */
export const MARK_EASE_MS = 180;

export type MarkPaint = {
  display: string;
  opacity: number;
  pointerEvents: string;
  hideAfterMs: number | null;
};

/** Map IR visible+opacity onto a paintable state that can ease instead of popping. */
export function markPaintState(visible: boolean, opacity: number): MarkPaint {
  const alpha = visible ? opacity : 0;
  return {
    display: "",
    opacity: alpha,
    pointerEvents: visible ? "" : "none",
    hideAfterMs: visible ? null : MARK_EASE_MS,
  };
}
