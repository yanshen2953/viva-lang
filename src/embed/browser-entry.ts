/**
 * Browser entry for the embed IIFE/ES bundle.
 * Does not import Node-only export (sharp/resvg) or prompt.node.
 */
export { createVivaWebEmbed } from "./web.js";
export { createVivaInlineEmbed } from "./inline.js";
export type { WebEmbedCommand, WebEmbedMessage, WebEmbedOptions } from "./web.js";
export type { VivaInlineEmbedOptions } from "./inline.js";
export {
  INLINE_DEFAULT_HANDBOOKS,
  VIVA_INLINE_PLUGIN_ID,
  VIVA_INLINE_MEDIA,
} from "./inline-styles.js";
export { createVivaAgentHost } from "../agent/host.js";
export { compileSource } from "../pipeline.js";
export { SYSTEM_PROMPT } from "../llm/system-prompt.js";
