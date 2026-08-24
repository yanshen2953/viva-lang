import { describe, expect, it } from "vitest";
import {
  combineSelection,
  invertSelection,
  pointInPolygon,
  regionHitsNode,
  sampleBezier,
} from "../../src/review/geometry";
import { buildAgentBrief } from "../../src/review/agent-brief";
import { listSelectableNodes } from "../../src/review/nodes";
import { compileSource } from "../../src/pipeline";
import { renderSvgFromIr } from "../../src/export/static-svg";
import { exportArtifact } from "../../src/export/index";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SelectedNode } from "../../src/review/types";

const node = (id: string, bbox = { x: 0, y: 0, w: 10, h: 10 }): SelectedNode => ({
  id,
  name: id,
  layerId: "L",
  layerName: "main",
  bbox,
});

describe("review selection geometry", () => {
  it("combines add / subtract / intersect / invert like Photoshop", () => {
    const a = [node("a"), node("b")];
    const b = [node("b"), node("c")];
    expect(combineSelection(a, b, "replace").map((n) => n.id)).toEqual(["b", "c"]);
    expect(combineSelection(a, b, "add").map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
    expect(combineSelection(a, b, "subtract").map((n) => n.id)).toEqual(["a"]);
    expect(combineSelection(a, b, "intersect").map((n) => n.id)).toEqual(["b"]);
    expect(invertSelection([node("a"), node("b"), node("c")], [node("b")]).map((n) => n.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("hits rect / lasso / bezier regions", () => {
    const target = node("dot", { x: 40, y: 40, w: 20, h: 20 });
    expect(regionHitsNode({ kind: "rect", x: 30, y: 30, w: 40, h: 40 }, target)).toBe(true);
    expect(regionHitsNode({ kind: "point", x: 50, y: 50 }, target)).toBe(true);
    const lasso = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(pointInPolygon({ x: 50, y: 50 }, lasso)).toBe(true);
    expect(regionHitsNode({ kind: "lasso", points: lasso }, target)).toBe(true);
    const bez = sampleBezier([
      { x: 0, y: 0 },
      { x: 50, y: -20 },
      { x: 50, y: 120 },
      { x: 100, y: 100 },
    ]);
    expect(bez.length).toBeGreaterThan(4);
    expect(
      regionHitsNode(
        {
          kind: "bezier",
          points: [
            { x: 0, y: 0 },
            { x: 0, y: 80 },
            { x: 80, y: 80 },
            { x: 80, y: 0 },
            { x: 80, y: -20 },
            { x: 0, y: -20 },
            { x: 0, y: 0 },
          ],
        },
        target,
      ),
    ).toBe(true);
  });

  it("builds rich agent brief", () => {
    const brief = buildAgentBrief({
      selection: [node("main:t", { x: 10, y: 20, w: 30, h: 12 })],
      feedback: [
        {
          id: "fb_1",
          kind: "fix",
          text: "把标题改成 42",
          severity: "error",
          selectionIds: ["main:t"],
          createdAt: 1,
        },
      ],
    });
    expect(brief).toContain("main:t");
    expect(brief).toContain("[error/fix]");
    expect(brief).toContain("Repair policy");
  });
});

describe("vector export id correspondence", () => {
  it("static SVG data-viva-id matches listSelectableNodes", () => {
    const src = readFileSync(path.resolve("examples/hello.viva"), "utf8");
    const { ir, error } = compileSource(src, "hello.viva");
    expect(error).toBeNull();
    const nodes = listSelectableNodes(ir!);
    expect(nodes.length).toBeGreaterThan(0);
    const svg = renderSvgFromIr(ir!);
    for (const n of nodes) {
      expect(svg).toContain(`data-viva-id="${n.id}"`);
    }
  });

  it("exports true vector PDF by default (not pdf-raster)", async () => {
    const src = readFileSync(path.resolve("examples/hello.viva"), "utf8");
    const pdf = await exportArtifact(src, "pdf", {}, "hello.viva");
    expect(pdf.vector).toBe(true);
    expect(String.fromCharCode(...pdf.bytes.slice(0, 4))).toBe("%PDF");
    // Vector PDF should not embed a large PNG image XObject for hello
    const text = new TextDecoder("latin1").decode(pdf.bytes);
    expect(text).not.toMatch(/\/Subtype\s*\/Image/);

    const raster = await exportArtifact(src, "pdf-raster", { width: 320 }, "hello.viva");
    expect(raster.vector).toBe(false);
    const rtext = new TextDecoder("latin1").decode(raster.bytes);
    expect(rtext).toMatch(/\/Subtype\s*\/Image/);
  }, 30_000);
});
