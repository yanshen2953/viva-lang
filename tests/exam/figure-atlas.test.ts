import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileSource } from "../../src/pipeline.js";

describe("figure-atlas example", () => {
  it("compiles six-panel atlas with print-nature handbook (default)", () => {
    const src = readFileSync("examples/figure-atlas.viva", "utf8");
    const result = compileSource(src, "figure-atlas.viva", {
      handbookIds: ["print-nature"],
    });
    expect(result.error).toBeNull();
    expect(result.ir?.name).toBe("Figure Atlas");
    expect(result.ir?.scene.layers.length).toBeGreaterThan(8);
    expect(result.ir?.frames.map((f) => f.name)).toEqual(
      expect.arrayContaining(["a", "b", "c", "d", "e", "f"]),
    );
    const hasHeat = result.ir?.scene.layers.some((l) =>
      l.items.some((i) => i.kind === "for" && i.body.some((b) => b.kind === "node" && b.name === "heatCell")),
    );
    expect(hasHeat).toBe(true);
  });
});
