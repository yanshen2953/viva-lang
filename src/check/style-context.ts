import type { VisualIR } from "../ir.js";
import { setStyleContext } from "../style/context.js";

/** Enable palette() / handbook colors during headless flatten (matches Runtime). */
export function withIrStyleContext<T>(ir: VisualIR, fn: () => T): T {
  if (!ir.meta) return fn();
  setStyleContext({ meta: ir.meta });
  try {
    return fn();
  } finally {
    setStyleContext(null);
  }
}
