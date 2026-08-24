/**
 * HTTP webhook pipeline adapter.
 * Hosts register this; Viva core stays free of HPC / science-tool specifics.
 */
import type { PipelineDefFull } from "../port.js";
import type { PipelineArtifact } from "../../types.js";

export type HttpWebhookPipelineOptions = {
  id: string;
  title: string;
  description?: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  outputs?: PipelineDefFull["outputs"];
  inputs?: PipelineDefFull["inputs"];
};

export function createHttpWebhookPipeline(
  options: HttpWebhookPipelineOptions,
): PipelineDefFull {
  return {
    id: options.id,
    title: options.title,
    description: options.description,
    outputs: options.outputs ?? [],
    inputs: options.inputs,
    async launch(ctx) {
      const res = await fetch(options.url, {
        method: options.method ?? "POST",
        headers: {
          "content-type": "application/json",
          ...options.headers,
        },
        body: JSON.stringify({
          kind: "viva-pipeline",
          pipelineId: options.id,
          sessionId: ctx.session.id,
          values: ctx.input.values ?? {},
        }),
        signal: ctx.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        return {
          runId: "",
          status: "error",
          error: `HTTP ${res.status}: ${text.slice(0, 240)}`,
        };
      }
      const body = (await res.json()) as {
        values?: Record<string, unknown>;
        artifacts?: PipelineArtifact[];
        error?: string;
        status?: string;
      };
      if (body.status === "error" || body.error) {
        return { runId: "", status: "error", error: body.error ?? "webhook error" };
      }
      return {
        runId: "",
        status: "ok",
        values: body.values ?? {},
        artifacts: body.artifacts,
      };
    },
  };
}
