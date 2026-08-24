/** Shared chrome for chat / IDE inline cards (publication-light, interactive). */

export const INLINE_STYLE_ID = "viva-inline-embed-styles";

export const INLINE_DEFAULT_HANDBOOKS = ["print-nature"] as const;

export const VIVA_INLINE_PLUGIN_ID = "builtin.viva-inline";

export const VIVA_INLINE_MEDIA = [
  "application/vnd.viva",
  "text/x-viva",
  "viva/source",
  "viva/*",
] as const;

export function inlineEmbedCss(maxHeight = 480): string {
  return `
.viva-inline-root {
  box-sizing: border-box;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  max-width: 100%;
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.05), 0 4px 12px rgb(15 23 42 / 0.04);
}
.viva-inline-stage {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 96px;
  max-height: ${maxHeight}px;
  padding: 14px 16px;
  background: #ffffff;
  overflow: auto;
}
.viva-inline-stage svg {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}
.viva-inline-stage:focus-within {
  outline: 2px solid #93c5fd;
  outline-offset: -2px;
}
.viva-inline-check {
  box-sizing: border-box;
  margin: 0;
  padding: 8px 16px 10px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #334155;
  font: 11px/1.45 ui-sans-serif, system-ui, sans-serif;
}
.viva-inline-check[hidden] {
  display: none;
}
.viva-inline-check-line {
  margin: 0 0 4px;
}
.viva-inline-check-line:last-child {
  margin-bottom: 0;
}
`;
}

export function ensureInlineEmbedStyles(maxHeight = 480): void {
  if (typeof document === "undefined") return;
  let el = document.getElementById(INLINE_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = INLINE_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = inlineEmbedCss(maxHeight);
}

export function applyInlineEmbedChrome(root: HTMLElement, maxHeight = 480): HTMLElement {
  ensureInlineEmbedStyles(maxHeight);
  root.classList.add("viva-inline-root");
  const stage = document.createElement("div");
  stage.className = "viva-inline-stage";
  const strip = document.createElement("div");
  strip.className = "viva-inline-check";
  strip.hidden = true;
  root.appendChild(stage);
  root.appendChild(strip);
  return stage;
}
