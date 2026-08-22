import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { compileSource } from "../../src/pipeline";
import { defsFilterIds, filterPrimitives, mountLayers } from "./dom";

const examDir = path.resolve("examples/exam");

/**
 * Snapshot layer: renders the layer-group SVG structure (via the real paint
 * helpers) and snapshots a *normalized* text tree. Numbers are kept as the
 * attributes the runtime emits (`opacity="0.5"`) but structural ids are
 * stripped so the snapshot is stable across compiler internals. Swap this for a
 * real SVG screenshot harness (Plot/ggplot vdiffr analog) when a browser is
 * available — see scripts/exam-layers-ui.mjs.
 */
function normalizedTree(name: string): string {
  const src = readFileSync(path.join(examDir, `${name}.viva`), "utf8");
  const result = compileSource(src, `${name}.viva`);
  if (result.error || !result.ir) throw new Error(`${name}: ${result.error}`);
  const { snapshots, defs } = mountLayers(result.ir);

  const lines = snapshots.map((snap) => {
    // Normalize the generated filter id (contains a compiler sequence number).
    const filter = snap.filter?.replace(/flt_layer_layer_\d+/, "flt_layer_L") ?? null;
    return [
      `${snap.order}:${snap.name}`,
      `opacity=${snap.opacity ?? "(default)"}`,
      `display=${snap.display || "(visible)"}`,
      `blend=${snap.blend || "(normal)"}`,
      `filter=${filter ?? "(none)"}`,
    ].join(" ");
  });

  const filters = defsFilterIds(defs)
    .map((id) => (filterPrimitives(defs)[id] ?? []).join(","))
    .sort();
  return `${lines.join("\n")}\n--- defs ---\n${filters.join("\n") || "(none)"}`;
}

describe("exam layers — SVG structure snapshots (numbers normalized)", () => {
  it("L1 z-order", () => {
    expect(normalizedTree("L1_zorder")).toMatchSnapshot();
  });
  it("L2 opacity", () => {
    expect(normalizedTree("L2_opacity")).toMatchSnapshot();
  });
  it("L3 visible:false", () => {
    expect(normalizedTree("L3_visible_false")).toMatchSnapshot();
  });
  it("L4 blend", () => {
    expect(normalizedTree("L4_blend")).toMatchSnapshot();
  });
  it("L5 blur/glow", () => {
    expect(normalizedTree("L5_blur_glow")).toMatchSnapshot();
  });
});
