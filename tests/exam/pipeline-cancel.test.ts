import { describe, expect, it } from "vitest";
import { createVivaAgentHost } from "../../src/agent/host.js";

describe("pipeline cancel", () => {
  it("aborts an in-flight launch via AbortSignal", async () => {
    const host = createVivaAgentHost();
    const session = host.createSession({ mount: null });
    session.compile(`artifact C
data series = []
scene
  layer a
    node t
      x: 1
      y: 1
      text: "c"
`);

    host.pipeline.register({
      id: "slow",
      title: "Slow",
      outputs: [],
      launch: async (ctx) => {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 5_000);
          ctx.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new Error("aborted"));
          });
        });
        return { runId: "", status: "ok", values: {} };
      },
    });

    let runId = "";
    host.events.on("pipeline-start", (e) => {
      runId = String((e.detail as { runId?: string })?.runId ?? "");
    });
    const pending = host.pipeline.run("slow", { sessionId: session.id });
    await new Promise((r) => setTimeout(r, 20));
    expect(runId).toMatch(/^run_/);
    await host.pipeline.cancel(runId);
    const handle = await pending;
    expect(handle.status).toBe("cancelled");
  });
});
