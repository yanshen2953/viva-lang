/** Host glue: drag a param, pipeline writes data back. No new keyword. */

import type { VivaAgentHost } from "../host.js";
import type { PipelineContext } from "./port.js";

export const DRAG_PARAM_PIPELINE_ID = "viva.drag-param";

export function registerDragParamPipeline(host: VivaAgentHost): void {
  host.pipeline.register({
    id: DRAG_PARAM_PIPELINE_ID,
    title: "Drag param → series",
    description: "Read state.param and write a one-point data.series for the bound chart.",
    inputs: [{ name: "param", target: "state", path: "param" }],
    outputs: [{ name: "series", target: "data", path: "series" }],
    async launch(ctx: PipelineContext) {
      const world = ctx.session.getWorld();
      const state = (world.state ?? {}) as Record<string, unknown>;
      const raw = ctx.input.values?.param ?? state.param ?? 0.5;
      const param = Number(raw);
      const t = Number(state.t ?? 0);
      const series = [{ t, v: Number.isFinite(param) ? param : 0.5 }];
      ctx.session.setData("series", series);
      return { runId: "", status: "ok", values: { series } };
    },
  });
}
