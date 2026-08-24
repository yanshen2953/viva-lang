/** Host glue: drag a param, pipeline writes data back. No new keyword. */

import type { VivaAgentHost } from "../host.js";
import type { VivaSession } from "../session.js";
import type { PipelineContext } from "./port.js";

export const DRAG_PARAM_PIPELINE_ID = "viva.drag-param";

export function registerDragParamPipeline(host: VivaAgentHost): void {
  if (host.pipeline.list().some((d) => d.id === DRAG_PARAM_PIPELINE_ID)) return;
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

/** Product loop: watch state.param and run the pipeline. Host glue, not a keyword. */
export function attachDragParamLoop(
  session: VivaSession,
  host: VivaAgentHost,
  opts?: { path?: string },
): () => void {
  registerDragParamPipeline(host);
  const path = opts?.path ?? "param";
  const world = session.getWorld();
  const root = (world.state ?? {}) as Record<string, unknown>;
  let last: unknown = root[path.replace(/^state\./, "")];
  let running = false;
  return session.watch(path, (value) => {
    if (Object.is(value, last) || running) return;
    last = value;
    running = true;
    void host.pipeline
      .run(DRAG_PARAM_PIPELINE_ID, { sessionId: session.id })
      .finally(() => {
        running = false;
      });
  });
}
