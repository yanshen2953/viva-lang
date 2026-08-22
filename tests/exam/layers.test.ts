import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { compileSource } from "../../src/pipeline";
import { applyBlend, resolveFilter, ensureDefs } from "../../src/paint";
import type { VisualIR } from "../../src/ir";
import {
  FakeElement,
  documentLike,
  defsFilterIds,
  filterPrimitives,
  installDom,
  layerPropsByName,
  layerSnapshotByName,
  mountLayers,
  nodePropsByName,
} from "./dom";

installDom();

const examDir = path.resolve("examples/exam");

function load(name: string): VisualIR {
  const src = readFileSync(path.join(examDir, `${name}.viva`), "utf8");
  const result = compileSource(src, `${name}.viva`);
  if (result.error || !result.ir) throw new Error(`${name}: ${result.error}`);
  return result.ir;
}

describe("exam layers — compile IR contract", () => {
  it("L1: later layer is declared after earlier (z-order = declaration order)", () => {
    const ir = load("L1_zorder");
    expect(ir.scene.layers.map((l) => l.name)).toEqual(["bottom", "top"]);
    const { snapshots, svg } = mountLayers(ir);
    expect(snapshots.map((s) => s.name)).toEqual(["bottom", "top"]);
    // Sibling order in the DOM = paint order; the later sibling draws on top.
    // (ignore the <defs> which ensureDefs inserts as the first child)
    const groups = svg.children.filter((c) => c.tagName === "g");
    expect(groups.map((c) => c.getAttribute("data-viva-layer"))).toEqual([
      "bottom",
      "top",
    ]);
    // Both layers are on top of each other (same anchor) to make the test meaningful.
    // Both shapes share the same anchor so the test is actually about stacking.
    expect(nodePropsByName(ir, "bottom", "back")).toMatchObject({ x: 100, y: 100 });
    expect(nodePropsByName(ir, "top", "front")).toMatchObject({ x: 100, y: 100 });
  });

  it("L2: layer opacity flows to the <g> opacity attribute", () => {
    const ir = load("L2_opacity");
    expect(layerPropsByName(ir, "mist")).toMatchObject({ opacity: 0.5 });
    const { snapshots } = mountLayers(ir);
    const snap = layerSnapshotByName(snapshots, "mist");
    expect(snap?.opacity).toBe("0.5");
    expect(snap?.display).toBe("");
  });

  it("L3: visible:false produces display:none on the group", () => {
    const ir = load("L3_visible_false");
    expect(layerPropsByName(ir, "hidden")).toMatchObject({ visible: false });
    const { snapshots } = mountLayers(ir);
    const snap = layerSnapshotByName(snapshots, "hidden");
    expect(snap?.display).toBe("none");
  });

  it("L4: blend:screen is a string and becomes mix-blend-mode", () => {
    const ir = load("L4_blend");
    expect(layerPropsByName(ir, "glowLayer")).toMatchObject({ blend: "screen" });
    const { snapshots } = mountLayers(ir);
    const snap = layerSnapshotByName(snapshots, "glowLayer");
    expect(snap?.blend).toBe("screen");
  });

  it("L5: whole-layer blur/glow attaches a filter to the <g>", () => {
    const ir = load("L5_blur_glow");
    expect(layerPropsByName(ir, "soft")).toMatchObject({ blur: 4, glow: 6 });
    const { snapshots, defs } = mountLayers(ir);
    const snap = layerSnapshotByName(snapshots, "soft");
    expect(snap?.filter).toMatch(/^url\(#flt_layer_/);
    const filterId = (snap?.filter ?? "").match(/^url\(#(.+)\)$/)?.[1];
    expect(filterId).toBeTruthy();
    const prims = filterPrimitives(defs)[filterId!];
    expect(prims).toBeDefined();
    expect(prims).toContain("feGaussianBlur");
    expect(prims).toContain("feFlood");
    expect(defsFilterIds(defs)).toContain(filterId);
  });

  it("every exam layer source compiles cleanly", () => {
    for (const name of [
      "L1_zorder",
      "L2_opacity",
      "L3_visible_false",
      "L4_blend",
      "L5_blur_glow",
    ]) {
      expect(() => load(name)).not.toThrow();
    }
  });
});

describe("paint helpers (real code) against the fake DOM", () => {
  it("resolveFilter emits a combined blur + glow chain", () => {
    const svg = new FakeElement("svg");
    const defs = ensureDefs(svg as unknown as SVGElement) as unknown as FakeElement;
    const url = resolveFilter(
      defs as unknown as SVGDefsElement,
      "soft",
      { blur: 4, glow: 6, glowColor: "#38bdf8", fill: "#38bdf8" },
    );
    expect(url).toMatch(/^url\(#flt_soft\)$/);
    const filter = defs.children.find((c) => c.tagName === "filter");
    const tags = (filter?.children ?? []).map((c) => c.tagName);
    expect(tags).toContain("feGaussianBlur"); // blur
    expect(tags).toContain("feFlood"); // glow color
    expect(tags).toContain("feMerge"); // combine
  });

  it("applyBlend sets and clears mix-blend-mode", () => {
    const el = new FakeElement("rect");
    applyBlend(el as unknown as SVGElement, { blend: "screen" });
    expect(el.style.mixBlendMode).toBe("screen");
    applyBlend(el as unknown as SVGElement, { blend: undefined });
    expect(el.style.mixBlendMode).toBe("");
    // Fake DOM install makes the global document available to paint helpers.
    expect(documentLike.createElementNS("ns", "g").tagName).toBe("g");
  });
});
