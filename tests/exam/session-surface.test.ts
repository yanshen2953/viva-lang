import { afterAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { createVivaAgentHost } from "../../src/agent/host.js";
import { startAgentHttpServer } from "../../src/agent/http-server.js";
import { createHttpWebhookPipeline } from "../../src/agent/pipeline/adapters/http-webhook.js";
import { handleMcpTool } from "../../src/mcp/tools.js";

const HELLO = `artifact "Session"
data series = [{ x: 1, y: 2 }, { x: 2, y: 4 }]
state n = 0
scene
  background: #ffffff
  layer a
    node t
      x: 10
      y: 10
      w: 80
      h: 40
      fill: #111111
      text: n
widget chart.scatter
  data: series
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
`;

const PATCHED = `artifact "Session"
data series = [{ x: 1, y: 2 }, { x: 2, y: 4 }]
state n = 3
scene
  background: #ffffff
  layer a
    node t
      x: 10
      y: 10
      w: 80
      h: 40
      fill: #111111
      text: n
widget chart.scatter
  data: series
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
`;

describe("HTTP session / pipeline / provenance", () => {
  let handle: Awaited<ReturnType<typeof startAgentHttpServer>>;

  afterAll(async () => {
    if (handle) await handle.close();
  });

  it("creates a session, compiles, runs inline.set, exports provenance", async () => {
    handle = await startAgentHttpServer({ port: 18766, host: "127.0.0.1" });
    const base = `http://127.0.0.1:${handle.port}`;

    const created = await fetch(`${base}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handbooks: ["print-nature"] }),
    });
    const session = (await created.json()) as { id: string };
    expect(session.id).toMatch(/^sess_/);

    const compiled = await fetch(`${base}/api/session/${session.id}/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: HELLO }),
    });
    const compileJson = (await compiled.json()) as { ok: boolean; artifact: string };
    expect(compileJson.ok).toBe(true);
    expect(compileJson.artifact).toBe("Session");

    const run = await fetch(`${base}/api/pipeline/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "inline.set",
        sessionId: session.id,
        values: { "data.series": [{ x: 1, y: 2 }] },
      }),
    });
    const runJson = (await run.json()) as { status: string };
    expect(runJson.status).toBe("ok");

    const world = await fetch(`${base}/api/session/${session.id}/world`);
    const worldJson = (await world.json()) as { data: { series: unknown[] } };
    expect(worldJson.data.series).toEqual([{ x: 1, y: 2 }]);

    const bundle = await fetch(`${base}/api/session/${session.id}/bundle`);
    const bundleJson = (await bundle.json()) as {
      version: number;
      records: { kind: string }[];
      latestSource?: string;
    };
    expect(bundleJson.version).toBe(1);
    expect(bundleJson.records.some((r) => r.kind === "generate" || r.kind === "compile")).toBe(
      true,
    );
    expect(bundleJson.records.some((r) => r.kind === "pipeline")).toBe(true);
    expect(bundleJson.latestSource).toContain("artifact");

    const listed = await fetch(`${base}/api/pipeline`);
    const listedJson = (await listed.json()) as { pipelines: { id: string }[] };
    expect(listedJson.pipelines.some((p) => p.id === "inline.set")).toBe(true);
  });
});

describe("MCP session + pipeline tools", () => {
  it("compiles through viva_session and writes data via viva_pipeline", async () => {
    const host = createVivaAgentHost();
    const created = await handleMcpTool(
      "viva_session",
      { action: "create", handbookIds: ["print-nature"] },
      host,
    );
    const session = JSON.parse(created.content[0]!.text) as { id: string };

    const compiled = await handleMcpTool(
      "viva_session",
      { action: "compile", sessionId: session.id, source: HELLO },
      host,
    );
    const compileJson = JSON.parse(compiled.content[0]!.text) as {
      ok: boolean;
      visualOk?: boolean;
    };
    expect(compileJson.ok).toBe(true);
    expect(typeof compileJson.visualOk).toBe("boolean");

    const patched = await handleMcpTool(
      "viva_session",
      { action: "patch", sessionId: session.id, source: PATCHED },
      host,
    );
    expect(JSON.parse(patched.content[0]!.text).ok).toBe(true);

    const piped = await handleMcpTool(
      "viva_pipeline",
      {
        action: "run",
        id: "inline.set",
        sessionId: session.id,
        values: { "data.series": [7, 8] },
      },
      host,
    );
    expect(JSON.parse(piped.content[0]!.text).status).toBe("ok");

    const world = await handleMcpTool(
      "viva_session",
      { action: "world", sessionId: session.id },
      host,
    );
    const worldJson = JSON.parse(world.content[0]!.text) as {
      data: { series: number[] };
      state: { n: number };
    };
    expect(worldJson.data.series).toEqual([7, 8]);
    expect(worldJson.state.n).toBe(3);

    const prov = await handleMcpTool(
      "viva_session",
      { action: "provenance", sessionId: session.id },
      host,
    );
    const records = JSON.parse(prov.content[0]!.text).records as { kind: string }[];
    expect(records.some((r) => r.kind === "pipeline")).toBe(true);
  });
});

describe("http-webhook pipeline adapter", () => {
  it("POSTs values and applies returned data", async () => {
    const webhook = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(Buffer.from(c)));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          values?: { scale?: number };
        };
        const scale = Number(body.values?.scale ?? 1);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ values: { series: [{ x: scale, y: scale * 2 }] } }));
      });
    });
    await new Promise<void>((resolve) => webhook.listen(18767, "127.0.0.1", resolve));
    const addr = webhook.address();
    const port = typeof addr === "object" && addr ? addr.port : 18767;

    const host = createVivaAgentHost();
    const session = host.createSession({ mount: null });
    session.compile(HELLO);
    host.pipeline.register(
      createHttpWebhookPipeline({
        id: "scale",
        title: "Scale series",
        url: `http://127.0.0.1:${port}/run`,
        outputs: [{ name: "series", target: "data", path: "series" }],
      }),
    );
    const handle = await host.pipeline.run("scale", {
      sessionId: session.id,
      values: { scale: 4 },
    });
    expect(handle.status).toBe("ok");
    const world = session.getWorld() as { data: { series: { x: number; y: number }[] } };
    expect(world.data.series).toEqual([{ x: 4, y: 8 }]);

    await new Promise<void>((resolve, reject) =>
      webhook.close((err) => (err ? reject(err) : resolve())),
    );
  });
});

describe("domain slots", () => {
  it("registers builtin.json-table for JSON/CSV", () => {
    const host = createVivaAgentHost();
    expect(host.domains.resolve("application/json")?.id).toBe("builtin.json-table");
    expect(host.domains.resolve("text/csv")?.id).toBe("builtin.json-table");
  });
});
