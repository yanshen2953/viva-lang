/**
 * HTTP agent bridge — REST surface for any coding agent (no SDK required).
 */
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runArtifactChecks } from "../check/index.js";
import { describeModelSlots, resolveModelsConfig } from "../check/models/index.js";
import { exportArtifact, type ExportFormat } from "../export/index.js";
import { compileSource } from "../pipeline.js";
import { SYSTEM_PROMPT } from "../llm/system-prompt.js";
import { SYSTEM_PROMPT_SLIM } from "../llm/system-prompt-slim.js";
import { createVivaAgentHost, type VivaAgentHost } from "./host.js";
import { attachBuiltinPipelines } from "./remote-host.js";
import { createSessionFacade } from "./session-api.js";
import type { CompileMeta, StatePolicy } from "./types.js";

export type AgentHttpOptions = {
  port: number;
  host?: string;
  /** Static files root (optional). */
  root?: string;
  modelsConfigPath?: string;
  /** Inject a host (tests / shared MCP process). */
  hostApi?: VivaAgentHost;
};

export type AgentHttpHandle = {
  server: Server;
  port: number;
  host: string;
  close(): Promise<void>;
};

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(MODULE_DIR, "..");
const PACKAGE_JSON = path.resolve(MODULE_DIR, "../../package.json");

export function createAgentHttpServer(opts: AgentHttpOptions): Server {
  const host = opts.host ?? "127.0.0.1";
  const root = path.resolve(opts.root ?? process.cwd());
  const embedDir = path.join(PKG_ROOT, "embed");
  const hostApi = opts.hostApi ?? createVivaAgentHost();
  if (!opts.hostApi) attachBuiltinPipelines(hostApi);
  const sessions = createSessionFacade(hostApi);

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${host}:${opts.port}`);
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(body));
      };

      if (url.pathname === "/api/health" && req.method === "GET") {
        json(200, { ok: true, service: "viva-agent", version: await readVersion() });
        return;
      }
      if (url.pathname === "/api/version" && req.method === "GET") {
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end(await readVersion());
        return;
      }
      if (url.pathname === "/api/openapi.json" && req.method === "GET") {
        json(200, openApiSpec());
        return;
      }
      if (url.pathname === "/api/models" && req.method === "GET") {
        const configPath = url.searchParams.get("config") ?? opts.modelsConfigPath;
        json(200, describeModelSlots(resolveModelsConfig(configPath ?? undefined)));
        return;
      }
      if (url.pathname === "/api/prompt" && req.method === "GET") {
        const variant = url.searchParams.get("variant") ?? "slim";
        json(200, { system: variant === "full" ? SYSTEM_PROMPT : SYSTEM_PROMPT_SLIM, variant });
        return;
      }

      if (url.pathname === "/" || url.pathname === "/embed") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(embedDemoHtml());
        return;
      }

      if (url.pathname === "/embed/viva-embed.js") {
        const data = await readFile(path.join(embedDir, "viva-embed.js"), "utf8");
        res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
        res.end(data);
        return;
      }
      if (url.pathname === "/embed/viva-embed.iife.js") {
        const data = await readFile(path.join(embedDir, "viva-embed.iife.js"), "utf8");
        res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
        res.end(data);
        return;
      }

      if (url.pathname === "/api/compile" && req.method === "POST") {
        const payload = JSON.parse(await readBody(req)) as {
          source?: string;
          handbookIds?: string[];
          checkStructural?: boolean;
        };
        const result = compileSource(payload.source ?? "", "api.viva", {
          handbookIds: payload.handbookIds,
          check: payload.checkStructural ? { structural: true } : undefined,
        });
        json(200, result);
        return;
      }

      if (url.pathname === "/api/check" && req.method === "POST") {
        const payload = JSON.parse(await readBody(req)) as {
          source?: string;
          handbookIds?: string[];
          visual?: boolean;
          vision?: boolean;
          width?: number;
        };
        const compiled = compileSource(payload.source ?? "", "api.viva", {
          handbookIds: payload.handbookIds,
        });
        if (!compiled.ir) {
          json(400, { ok: false, error: compiled.error, diagnostics: compiled.diagnostics });
          return;
        }
        const checks = await runArtifactChecks(compiled.ir, {
          structural: true,
          visual: Boolean(payload.visual),
          vision: Boolean(payload.vision),
          source: payload.source,
          rasterWidth: payload.width ?? 960,
          modelsConfigPath: opts.modelsConfigPath,
        });
        json(200, {
          ...checks,
          artifact: compiled.ir.name,
          ok: checks.ok && (compiled.checkOk ?? true),
        });
        return;
      }

      if (url.pathname === "/api/export" && req.method === "POST") {
        const payload = JSON.parse(await readBody(req)) as {
          source?: string;
          format?: ExportFormat;
          handbookIds?: string[];
          width?: number;
        };
        const out = await exportArtifact(
          payload.source ?? "",
          payload.format ?? "svg",
          {
            width: payload.width,
            handbookIds: payload.handbookIds,
          },
          "api.viva",
        );
        res.writeHead(200, {
          "content-type": out.mime,
          "content-disposition": `attachment; filename="artifact.${out.format}"`,
        });
        res.end(Buffer.from(out.bytes));
        return;
      }

      if (await handleSessionRoutes(url, req, json, sessions)) return;
      if (await handlePipelineRoutes(url, req, json, sessions)) return;

      if (opts.root && url.pathname.startsWith("/")) {
        const filePath = path.join(root, decodeURIComponent(url.pathname));
        if (!filePath.startsWith(root)) {
          res.writeHead(403);
          res.end("forbidden");
          return;
        }
        const data = await readFile(filePath);
        res.writeHead(200);
        res.end(data);
        return;
      }

      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  });
}

export function startAgentHttpServer(opts: AgentHttpOptions): Promise<AgentHttpHandle> {
  const host = opts.host ?? "127.0.0.1";
  const server = createAgentHttpServer(opts);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, host, () => {
      resolve({
        server,
        port: opts.port,
        host,
        close: () =>
          new Promise((res, rej) => {
            server.close((e) => (e ? rej(e) : res()));
          }),
      });
    });
  });
}

async function handleSessionRoutes(
  url: URL,
  req: import("node:http").IncomingMessage,
  json: (status: number, body: unknown) => void,
  sessions: ReturnType<typeof createSessionFacade>,
): Promise<boolean> {
  if (url.pathname === "/api/session" && req.method === "GET") {
    json(200, { sessions: sessions.list() });
    return true;
  }
  if (url.pathname === "/api/session" && req.method === "POST") {
    const payload = JSON.parse((await readBody(req)) || "{}") as {
      handbooks?: string[];
      statePolicy?: StatePolicy;
      title?: string;
    };
    json(200, sessions.create(payload));
    return true;
  }

  const match = url.pathname.match(/^\/api\/session\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return false;
  const sessionId = decodeURIComponent(match[1]!);
  const action = match[2];

  if (!action && req.method === "GET") {
    json(200, sessions.get(sessionId));
    return true;
  }
  if (!action && req.method === "DELETE") {
    json(200, sessions.dispose(sessionId));
    return true;
  }
  if (action === "compile" && req.method === "POST") {
    const payload = JSON.parse((await readBody(req)) || "{}") as {
      source?: string;
      includeIr?: boolean;
      reason?: CompileMeta["reason"];
      handbookIds?: string[];
    };
    json(
      200,
      await sessions.compile(
        sessionId,
        payload.source ?? "",
        { reason: payload.reason ?? "generate", handbooks: payload.handbookIds },
        Boolean(payload.includeIr),
      ),
    );
    return true;
  }
  if (action === "patch" && req.method === "POST") {
    const payload = JSON.parse((await readBody(req)) || "{}") as {
      source?: string;
      includeIr?: boolean;
      reason?: CompileMeta["reason"];
      handbookIds?: string[];
    };
    json(
      200,
      sessions.patch(
        sessionId,
        payload.source ?? "",
        { reason: payload.reason ?? "repair", handbooks: payload.handbookIds },
        Boolean(payload.includeIr),
      ),
    );
    return true;
  }
  if (action === "world" && req.method === "GET") {
    json(200, sessions.world(sessionId));
    return true;
  }
  if ((action === "data" || action === "state") && req.method === "POST") {
    const payload = JSON.parse((await readBody(req)) || "{}") as {
      path?: string;
      value?: unknown;
    };
    json(200, sessions.set(sessionId, action, payload.path ?? "", payload.value));
    return true;
  }
  if (action === "simulate" && req.method === "POST") {
    const payload = JSON.parse((await readBody(req)) || "{}") as {
      ticks?: number;
      events?: { type: string; target: string; event?: Record<string, unknown> }[];
    };
    json(200, sessions.simulate(sessionId, payload));
    return true;
  }
  if (action === "provenance" && req.method === "GET") {
    json(200, { sessionId, records: sessions.provenance(sessionId) });
    return true;
  }
  if (action === "bundle" && (req.method === "GET" || req.method === "POST")) {
    json(200, sessions.bundle(sessionId));
    return true;
  }
  return false;
}

async function handlePipelineRoutes(
  url: URL,
  req: import("node:http").IncomingMessage,
  json: (status: number, body: unknown) => void,
  sessions: ReturnType<typeof createSessionFacade>,
): Promise<boolean> {
  if (url.pathname === "/api/pipeline" && req.method === "GET") {
    json(200, { pipelines: sessions.listPipelines() });
    return true;
  }
  if (url.pathname === "/api/pipeline/run" && req.method === "POST") {
    const payload = JSON.parse((await readBody(req)) || "{}") as {
      id?: string;
      sessionId?: string;
      values?: Record<string, unknown>;
      overrides?: Record<string, unknown>;
    };
    if (!payload.id || !payload.sessionId) {
      json(400, { error: "id and sessionId are required" });
      return true;
    }
    json(
      200,
      await sessions.runPipeline(payload.id, {
        sessionId: payload.sessionId,
        values: payload.values,
        overrides: payload.overrides,
      }),
    );
    return true;
  }
  if (url.pathname === "/api/pipeline/register" && req.method === "POST") {
    const payload = JSON.parse((await readBody(req)) || "{}") as {
      id?: string;
      title?: string;
      kind?: "inline" | "http-webhook";
      url?: string;
      description?: string;
    };
    if (!payload.id || !payload.title) {
      json(400, { error: "id and title are required" });
      return true;
    }
    json(
      200,
      sessions.registerPipeline({
        id: payload.id,
        title: payload.title,
        kind: payload.kind,
        url: payload.url,
        description: payload.description,
      }),
    );
    return true;
  }
  if (url.pathname === "/api/pipeline/cancel" && req.method === "POST") {
    const payload = JSON.parse((await readBody(req)) || "{}") as { runId?: string };
    if (!payload.runId) {
      json(400, { error: "runId is required" });
      return true;
    }
    json(200, await sessions.cancelPipeline(payload.runId));
    return true;
  }
  const runMatch = url.pathname.match(/^\/api\/pipeline\/([^/]+)$/);
  if (runMatch && req.method === "GET") {
    json(200, sessions.getPipelineRun(decodeURIComponent(runMatch[1]!)));
    return true;
  }
  return false;
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readVersion(): Promise<string> {
  try {
    const pkgPath = PACKAGE_JSON;
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { name: string; version: string };
    return `${pkg.name} ${pkg.version}`;
  } catch {
    return "viva-lang";
  }
}

function openApiSpec(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: { title: "Viva Agent HTTP Bridge", version: "0.1.0" },
    paths: {
      "/api/health": { get: { summary: "Liveness" } },
      "/api/version": { get: { summary: "Package version string" } },
      "/api/models": { get: { summary: "Resolved base/vision model slots" } },
      "/api/prompt": { get: { summary: "Core system prompt" } },
      "/api/compile": {
        post: {
          summary: "Compile Viva source → IR JSON",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    source: { type: "string" },
                    handbookIds: { type: "array", items: { type: "string" } },
                    checkStructural: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
      "/api/check": {
        post: {
          summary: "Structural / visual / vision QA",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    source: { type: "string" },
                    handbookIds: { type: "array", items: { type: "string" } },
                    visual: { type: "boolean" },
                    vision: { type: "boolean" },
                    width: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
      "/api/session": {
        get: { summary: "List headless sessions" },
        post: { summary: "Create a headless VivaSession" },
      },
      "/api/session/{id}/compile": {
        post: { summary: "Compile source into a session (records provenance)" },
      },
      "/api/session/{id}/patch": {
        post: { summary: "Patch session source with statePolicy" },
      },
      "/api/session/{id}/world": { get: { summary: "Read session state/data" } },
      "/api/session/{id}/bundle": { get: { summary: "Export provenance bundle" } },
      "/api/pipeline": { get: { summary: "List registered pipelines" } },
      "/api/pipeline/run": {
        post: { summary: "Run a pipeline against a session (inline.set or webhook)" },
      },
      "/api/export": {
        post: {
          summary: "Export svg|png|jpg|pdf",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    source: { type: "string" },
                    format: { type: "string" },
                    handbookIds: { type: "array", items: { type: "string" } },
                    width: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function embedDemoHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>Viva Agent</title>
<style>body{font:14px/1.4 system-ui;background:#f8fafc;color:#1e293b;margin:2rem;max-width:960px}
textarea{width:100%;min-height:200px;padding:12px;border:1px solid #e2e8f0;border-radius:8px;font-family:ui-monospace,monospace}
button{margin:8px 4px 0 0;padding:8px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer}
#panel{border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-top:12px;background:#fff}
pre{background:#f1f5f9;padding:12px;border-radius:8px;overflow:auto;font-size:12px}</style>
</head><body>
<h1>Viva Agent HTTP Bridge</h1>
<p>REST: <code>/api/compile</code> <code>/api/check</code> <code>/api/export</code> · Embed: <code>/embed/viva-embed.js</code></p>
<textarea id="src">artifact "Hello"
state n = 0
scene
  size: 400 200
  layer main
    node t
      x: 40
      y: 40
      text: n
event click on t
  n = n + 1
</textarea>
<div>
<button id="compile">Compile</button>
<button id="check">Check</button>
<button id="pdf">PDF</button>
</div>
<div id="panel"></div>
<pre id="out"></pre>
<script type="module">
import { createVivaInlineEmbed } from "/embed/viva-embed.js";
const embed = createVivaInlineEmbed({ mount: document.getElementById("panel") });
const src = () => document.getElementById("src").value;
document.getElementById("compile").onclick = () => embed.post({ type: "viva:patch", source: src() });
document.getElementById("check").onclick = async () => {
  const r = await fetch("/api/check", { method:"POST", headers:{"content-type":"application/json"},
    body: JSON.stringify({ source: src(), visual: true, handbookIds: ["print-nature"] }) });
  document.getElementById("out").textContent = await r.text();
};
document.getElementById("pdf").onclick = async () => {
  const r = await fetch("/api/export", { method:"POST", headers:{"content-type":"application/json"},
    body: JSON.stringify({ source: src(), format: "pdf", handbookIds: ["print-nature"] }) });
  const blob = await r.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "artifact.pdf";
  a.click();
};
</script>
</body></html>`;
}
