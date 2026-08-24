import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createVivaAgentHost } from "../../src/agent/host.js";
import { DRAG_PARAM_PIPELINE_ID, registerDragParamPipeline } from "../../src/agent/pipeline/drag-param.js";

describe("drag-param pipeline", () => {
  it("writes data.series from state.param without a new keyword", () => {
    const host = createVivaAgentHost();
    registerDragParamPipeline(host);
    const session = host.createSession({ mount: null });
    const src = readFileSync("examples/pipeline-drag-param.viva", "utf8");
    expect(src).not.toMatch(/\b(colorbar|figure|safe|lowerThird)\b/);
    const compiled = session.compile(src);
    expect(compiled.ok).toBe(true);
    session.setState("param", 0.8);
    session.setState("t", 3);
    return host.pipeline.run(DRAG_PARAM_PIPELINE_ID, { sessionId: session.id }).then((handle) => {
      expect(handle.status).toBe("ok");
      const series = session.getWorld().data as { series?: { t: number; v: number }[] };
      expect(series.series?.[0]?.v).toBeCloseTo(0.8);
      expect(series.series?.[0]?.t).toBe(3);
    });
  });
});
