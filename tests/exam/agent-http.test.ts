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

    const beatsSrc = `artifact "Beats"
data a = [{ x: 0, y: 2 }, { x: 1, y: 5 }]
data b = [{ x: 0, y: 8 }, { x: 1, y: 1 }]
scene
  size: 240 160
  background: #ffffff
widget layout.board
  w: 240
  h: 160
  safe: 16
  titleH: 24
  lowerH: 24
  beats: 2
  play: true
widget chart.line
  panel: beat0
  data: a
  xField: x
  yField: y
  xlim: 0 1
  ylim: 0 10
  interactive: false
widget chart.line
  panel: beat1
  data: b
  xField: x
  yField: y
  xlim: 0 1
  ylim: 0 10
  interactive: false
`;
    const beats = await fetch(`${base}/api/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: beatsSrc, format: "png", width: 160, beats: true }),
    });
    const beatsJson = (await beats.json()) as { ok: boolean; beats: number; frames: { base64: string }[] };
    expect(beatsJson.ok).toBe(true);
    expect(beatsJson.beats).toBe(2);
    expect(beatsJson.frames).toHaveLength(2);
    expect(beatsJson.frames[0]!.base64).not.toBe(beatsJson.frames[1]!.base64);

    const gif = await fetch(`${base}/api/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: beatsSrc, format: "gif", width: 160, beats: true }),
    });
    const gifJson = (await gif.json()) as { ok: boolean; mime: string; base64: string };
    expect(gifJson.ok).toBe(true);
    expect(gifJson.mime).toBe("image/gif");
    expect(Buffer.from(gifJson.base64, "base64").subarray(0, 6).toString("ascii")).toBe("GIF89a");
  }, 45_000);

  it("compile matches pipeline compileSource", async () => {
    const local = compileSource(HELLO, "t.viva");
    expect(local.ir?.name).toBe("Hi");
  });
});
