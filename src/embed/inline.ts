import { createVivaWebEmbed, type WebEmbedOptions } from "./web.js";
import {
  applyInlineEmbedChrome,
  INLINE_DEFAULT_HANDBOOKS,
  VIVA_INLINE_PLUGIN_ID,
} from "./inline-styles.js";
import {
  inlineCheckLines,
  inlineCheckStripOf,
  paintInlineCheckStrip,
} from "./inline-check.js";
import { runBrowserVisual } from "../check/browser-visual.js";

export {
  INLINE_DEFAULT_HANDBOOKS,
  VIVA_INLINE_PLUGIN_ID,
  VIVA_INLINE_MEDIA,
  inlineEmbedCss,
  ensureInlineEmbedStyles,
  applyInlineEmbedChrome,
} from "./inline-styles.js";
export { inlineCheckLines, paintInlineCheckStrip } from "./inline-check.js";

export type VivaInlineEmbedOptions = Omit<WebEmbedOptions, "mount" | "handbooks"> & {
  mount: HTMLElement;
  handbooks?: string[];
  /** Chat-friendly max stage height in px. Default 480. */
  maxHeight?: number;
};

/**
 * Default inline plugin: print-nature look + full Runtime (click/drag/tick).
 * Use in chat bubbles / IDE webviews instead of static PNG artifacts.
 */
export function createVivaInlineEmbed(opts: VivaInlineEmbedOptions) {
  const maxHeight = opts.maxHeight ?? 480;
  const stage = applyInlineEmbedChrome(opts.mount, maxHeight);
  const strip = inlineCheckStripOf(opts.mount);
  const embed = createVivaWebEmbed({
    ...opts,
    mount: stage,
    handbooks: opts.handbooks ?? [...INLINE_DEFAULT_HANDBOOKS],
    statePolicy: opts.statePolicy ?? "preserve-data",
  });
  const post = embed.post;
  return {
    ...embed,
    post(cmd: Parameters<typeof post>[0]) {
      const result = post(cmd);
      if (strip && (cmd.type === "viva:compile" || cmd.type === "viva:patch")) {
        const rec = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
        const diagnostics = Array.isArray(rec.diagnostics) ? [...rec.diagnostics] : [];
        const error = typeof rec.error === "string" ? rec.error : null;
        const ir = rec.ir && typeof rec.ir === "object" ? rec.ir : embed.session.getIR();
        if (ir) {
          try {
            diagnostics.push(...runBrowserVisual(ir as import("../ir.js").VisualIR));
          } catch {
            /* browser visual is warn-only */
          }
        }
        paintInlineCheckStrip(strip, inlineCheckLines(diagnostics, error));
      }
      return result;
    },
  };
}
