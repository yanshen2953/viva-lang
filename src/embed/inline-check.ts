/** Read-only check strip for inline cards. Not a repair loop. Not visual/raster. */

export type InlineCheckNote = {
  message?: string;
  code?: string;
  severity?: string;
};

export function inlineCheckLines(
  diagnostics: InlineCheckNote[] | undefined,
  error?: string | null,
): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  if (error) {
    lines.push(String(error));
    seen.add(String(error));
  }
  for (const d of diagnostics ?? []) {
    const msg = (d.message ?? "").trim();
    if (!msg || seen.has(msg)) continue;
    seen.add(msg);
    lines.push(d.code ? `${d.code} ${msg}` : msg);
  }
  return lines.slice(0, 5);
}

export function paintInlineCheckStrip(strip: HTMLElement, lines: string[]): void {
  strip.replaceChildren();
  if (!lines.length) {
    strip.hidden = true;
    strip.removeAttribute("data-count");
    return;
  }
  strip.hidden = false;
  strip.dataset.count = String(lines.length);
  for (const line of lines) {
    const p = document.createElement("p");
    p.className = "viva-inline-check-line";
    p.textContent = line;
    strip.appendChild(p);
  }
}

export function inlineCheckStripOf(root: HTMLElement): HTMLElement | null {
  return root.querySelector(".viva-inline-check");
}
