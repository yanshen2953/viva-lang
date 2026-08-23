import { createVivaWebEmbed, type WebEmbedOptions } from "./web.js";
import {
  applyInlineEmbedChrome,
  INLINE_DEFAULT_HANDBOOKS,
  VIVA_INLINE_PLUGIN_ID,
} from "./inline-styles.js";

export {
  INLINE_DEFAULT_HANDBOOKS,
  VIVA_INLINE_PLUGIN_ID,
  VIVA_INLINE_MEDIA,
  inlineEmbedCss,
  ensureInlineEmbedStyles,
  applyInlineEmbedChrome,
} from "./inline-styles.js";

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
  return createVivaWebEmbed({
    ...opts,
    mount: stage,
    handbooks: opts.handbooks ?? [...INLINE_DEFAULT_HANDBOOKS],
    statePolicy: opts.statePolicy ?? "preserve-data",
  });
}
