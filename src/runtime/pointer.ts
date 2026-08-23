/** HUD / play veils / brush overlays must not steal hover from marks. */
export function nodeIgnoresPointer(name: string, role?: unknown): boolean {
  const r = role === undefined || role === null ? "" : String(role);
  return (
    r === "hud" ||
    name === "chartTip" ||
    name === "brushRect" ||
    name === "brushPath" ||
    name.startsWith("__page_folio") ||
    name.includes("_veil_")
  );
}
