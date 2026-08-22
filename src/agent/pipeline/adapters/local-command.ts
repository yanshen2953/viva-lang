/**
 * Example local-command pipeline adapter (Node).
 * Hosts register this; Viva core stays free of HPC specifics.
 */
import { spawn } from "node:child_process";
import type { PipelineDefFull } from "../port.js";

export function createLocalCommandPipeline(options: {
  id: string;
  title: string;
  command: string;
  args?: string[];
  /** Map stdout JSON → output binding names */
  parseStdout?: (text: string) => Record<string, unknown>;
  outputs?: PipelineDefFull["outputs"];
}): PipelineDefFull {
  return {
    id: options.id,
    title: options.title,
    outputs: options.outputs ?? [{ name: "series", target: "data", path: "series" }],
    async launch(ctx) {
      const args = options.args ?? [];
      const child = spawn(options.command, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });
      const input = JSON.stringify(ctx.input.values ?? {});
      child.stdin.write(input);
      child.stdin.end();

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (c) => {
        stdout += String(c);
        ctx.log(String(c));
      });
      child.stderr.on("data", (c) => {
        stderr += String(c);
        ctx.log(String(c));
      });

      const code: number = await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (c) => resolve(c ?? 1));
        ctx.signal.addEventListener("abort", () => child.kill("SIGTERM"));
      });

      if (code !== 0) {
        return { runId: "", status: "error", error: stderr || `exit ${code}` };
      }
      const values = options.parseStdout
        ? options.parseStdout(stdout)
        : (JSON.parse(stdout || "{}") as Record<string, unknown>);
      return { runId: "", status: "ok", values };
    },
  };
}
