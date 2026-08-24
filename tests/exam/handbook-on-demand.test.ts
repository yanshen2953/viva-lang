import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { resolveSessionHandbooks } from "../../src/agent/handbook.js";

describe("handbook on-demand", () => {
  it("compile without handbookIds leaves meta unset", () => {
    const src = readFileSync("examples/figure-atlas.viva", "utf8");
    const bare = compileSource(src, "figure-atlas.viva");
    expect(bare.error).toBeNull();
    expect(bare.ir?.meta).toBeUndefined();
  });

  it("compile with handbookIds sets meta", () => {
    const src = readFileSync("examples/figure-atlas.viva", "utf8");
    const styled = compileSource(src, "figure-atlas.viva", {
      handbookIds: ["print-nature"],
    });
    expect(styled.ir?.meta?.handbookIds).toEqual(["print-nature"]);
  });

  it("resolveSessionHandbooks prefers explicit meta over session default", () => {
    expect(resolveSessionHandbooks({ handbooks: [] }, ["dashboard"])).toEqual([]);
    expect(resolveSessionHandbooks({ handbooks: ["print-nature"] }, ["dashboard"])).toEqual([
      "print-nature",
    ]);
    expect(resolveSessionHandbooks(undefined, ["dashboard"])).toEqual(["dashboard"]);
  });
});
