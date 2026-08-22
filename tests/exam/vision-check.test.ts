import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileSource } from "../../src/pipeline.js";
import { runVisionChecks } from "../../src/check/vision.js";
import type { VisionModelClient } from "../../src/check/models/types.js";
import { resolveModelsConfig } from "../../src/check/models/load-config.js";

describe("vision multimodal checks", () => {
  it("reports unconfigured when no vision slot", async () => {
    const src = readFileSync("examples/hello.viva", "utf8");
    const compiled = compileSource(src, "hello.viva");
    const diags = await runVisionChecks(compiled.ir!, {
      modelsConfigPath: "/nonexistent/models.json",
    });
    expect(diags.some((d) => d.code === "check.vision.unconfigured")).toBe(true);
  });

  it("parses vision model JSON issues via injected client", async () => {
    const src = readFileSync("examples/figure-atlas.viva", "utf8");
    const compiled = compileSource(src, "figure-atlas.viva", {
      handbookIds: ["print-nature"],
    });
    const mockClient: VisionModelClient = {
      completeVision: async () => ({
        text: JSON.stringify({
          ok: false,
          issues: [
            {
              severity: "warn",
              code: "panel_label",
              message: "Panel (e) label overlaps plot",
              hint: "Move panel-label nodes",
            },
          ],
        }),
      }),
    };
    const diags = await runVisionChecks(compiled.ir!, {
      visionClient: mockClient,
      source: src,
    });
    expect(diags.some((d) => d.code === "check.vision.panel_label")).toBe(true);
    expect(diags[0]?.layer).toBe("vision");
  });

  it("loads example model slots shape", () => {
    const slots = resolveModelsConfig("viva.models.json.example");
    expect(slots.base?.model).toBe("deepseek-chat");
    expect(slots.vision?.model).toBe("deepseek-v4-flash-vision-exp");
  });
});
