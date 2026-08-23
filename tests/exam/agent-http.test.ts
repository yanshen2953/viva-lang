import { afterAll, describe, expect, it } from "vitest";
import { startAgentHttpServer } from "../../src/agent/http-server.js";
import { compileSource } from "../../src/pipeline.js";

const HELLO = `artifact "Hi"
scene
  layer a
    node t
      x: 10
      y: 10
      text: "ok"
`;

describe("agent HTTP server", () => {
  let handle: Awaited<ReturnType<typeof startAgentHttpServer>>;

  afterAll(async () => {
    if (handle) await handle.close();
  });

  it("starts and serves health + compile + check", async () => {
    handle = await startAgentHttpServer({ port: 18765, host: "127.0.0.1" });
    const base = `http://127.0.0.1:${handle.port}`;

    const health = await fetch(`${base}/api/health`);
    expect(health.ok).toBe(true);
    const healthJson = (await health.json()) as { ok: boolean };
    expect(healthJson.ok).toBe(true);

    const compile = await fetch(`${base}/api/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: HELLO }),
    });
    const compileJson = (await compile.json()) as { ir: { name: string } | null };
    expect(compileJson.ir?.name).toBe("Hi");

    const check = await fetch(`${base}/api/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: HELLO, visual: false }),
    });
    const checkJson = (await check.json()) as { ok: boolean };
    expect(checkJson.ok).toBe(true);

    const openapi = await fetch(`${base}/api/openapi.json`);
    expect(openapi.ok).toBe(true);
  });

  it("compile matches pipeline compileSource", async () => {
    const local = compileSource(HELLO, "t.viva");
    expect(local.ir?.name).toBe("Hi");
  });
});
