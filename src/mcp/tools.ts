import { z } from "zod";
import { compileSource } from "../pipeline.js";
import { runArtifactChecks } from "../check/index.js";
import { exportArtifact, exportBeatAnimation, exportBeatSequence, isBeatAnimFormat, type ExportFormat } from "../export/index.js";
import { SYSTEM_PROMPT } from "../llm/system-prompt.js";
import { SYSTEM_PROMPT_SLIM } from "../llm/system-prompt-slim.js";
import { createNodePromptService } from "../agent/prompt.node.js";
import { describeModelSlots, resolveModelsConfig } from "../check/models/index.js";
import type { VivaAgentHost } from "../agent/host.js";
import { attachBuiltinPipelines, getRemoteAgentHost } from "../agent/remote-host.js";
import { createSessionFacade } from "../agent/session-api.js";
import type { CompileMeta, StatePolicy } from "../agent/types.js";

const handbookIdsSchema = z.array(z.string()).optional();

export function textResult(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    isError,
  };
}

export async function handleMcpTool(
  name: string,
  args: Record<string, unknown>,
  host?: VivaAgentHost,
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  try {
    switch (name) {
      case "viva_compile":
        return await toolCompile(args);
      case "viva_check":
        return await toolCheck(args);
      case "viva_export":
        return await toolExport(args);
      case "viva_prompt":
        return toolPrompt(args);
      case "viva_models":
        return toolModels(args);
      case "viva_session":
        return await toolSession(args, ensureHost(host));
      case "viva_pipeline":
        return await toolPipeline(args, ensureHost(host));
      default:
        return textResult(`Unknown tool: ${name}`, true);
    }
  } catch (err) {
    return textResult(err instanceof Error ? err.message : String(err), true);
  }
}

async function toolCompile(args: Record<string, unknown>) {
  const source = String(args.source ?? "");
  const handbookIds = args.handbookIds as string[] | undefined;
  const checkStructural = Boolean(args.checkStructural);
  const result = compileSource(source, "mcp.viva", {
    handbookIds,
    check: checkStructural ? { structural: true } : undefined,
  });
  return textResult(JSON.stringify(result, null, 2), !result.ir);
}

async function toolCheck(args: Record<string, unknown>) {
  const source = String(args.source ?? "");
  const handbookIds = args.handbookIds as string[] | undefined;
  const visual = Boolean(args.visual);
  const vision = Boolean(args.vision);
  const width = typeof args.width === "number" ? args.width : 960;
  const compiled = compileSource(source, "mcp.viva", { handbookIds });
  if (!compiled.ir) {
    return textResult(JSON.stringify({ ok: false, error: compiled.error }), true);
  }
  const checks = await runArtifactChecks(compiled.ir, {
    structural: true,
    visual,
    vision,
    source,
    rasterWidth: width,
  });
  const ok = checks.ok && (compiled.checkOk ?? true);
  return textResult(
    JSON.stringify({
      artifact: compiled.ir.name,
      ...checks,
      ok,
    }),
    !ok,
  );
}

async function toolExport(args: Record<string, unknown>) {
  const source = String(args.source ?? "");
  const format = (String(args.format ?? "svg") as ExportFormat);
  const handbookIds = args.handbookIds as string[] | undefined;
  const width = typeof args.width === "number" ? args.width : undefined;
  const outputPath = args.outputPath ? String(args.outputPath) : undefined;
  if (args.beats) {
    if (isBeatAnimFormat(format)) {
      const anim = await exportBeatAnimation(source, format, { handbookIds, width, beats: true }, "mcp.viva");
      if (outputPath) {
        const { writeFile, mkdir } = await import("node:fs/promises");
        const { dirname } = await import("node:path");
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, anim.bytes);
        return textResult(JSON.stringify({ ok: true, beats: true, path: outputPath, mime: anim.mime, bytes: anim.bytes.byteLength }));
      }
      return textResult(
        JSON.stringify({
          ok: true,
          mime: anim.mime,
          bytes: anim.bytes.byteLength,
          base64: Buffer.from(anim.bytes).toString("base64"),
        }),
      );
    }
    const frames = await exportBeatSequence(source, { handbookIds, width, beats: true }, "mcp.viva");
    if (outputPath) {
      const { writeFile, mkdir } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      const stem = outputPath.replace(/\.(png|jpg|jpeg|svg|pdf|gif|mp4)$/i, "");
      await mkdir(dirname(stem), { recursive: true });
      const paths: string[] = [];
      for (const frame of frames) {
        const target = `${stem}-beat${frame.index}.png`;
        await writeFile(target, frame.bytes);
        paths.push(target);
      }
      return textResult(JSON.stringify({ ok: true, beats: frames.length, paths, mime: "image/png" }));
    }
    return textResult(
      JSON.stringify({
        ok: true,
        beats: frames.length,
        mime: "image/png",
        frames: frames.map((frame) => ({
          index: frame.index,
          bytes: frame.bytes.length,
          base64: Buffer.from(frame.bytes).toString("base64"),
        })),
      }),
    );
  }
  const out = await exportArtifact(source, format, { handbookIds, width }, "mcp.viva");
  if (outputPath) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(outputPath, out.bytes);
    return textResult(
      JSON.stringify({
        ok: true,
        path: outputPath,
        format: out.format,
        mime: out.mime,
        bytes: out.bytes.length,
      }),
    );
  }
  return textResult(
    JSON.stringify({
      ok: true,
      format: out.format,
      mime: out.mime,
      bytes: out.bytes.length,
      base64: Buffer.from(out.bytes).toString("base64"),
    }),
  );
}

function toolPrompt(args: Record<string, unknown>) {
  const handbookIds = (args.handbookIds as string[] | undefined) ?? [];
  const variant = String(args.variant ?? "slim");
  const prompt = createNodePromptService();
  const parts = [variant === "full" ? SYSTEM_PROMPT : SYSTEM_PROMPT_SLIM];
  for (const id of handbookIds) {
    parts.push(prompt.loadHandbook(id));
  }
  return textResult(parts.join("\n\n---\n\n"));
}

function toolModels(args: Record<string, unknown>) {
  const configPath = args.configPath ? String(args.configPath) : undefined;
  return textResult(JSON.stringify(describeModelSlots(resolveModelsConfig(configPath)), null, 2));
}

function ensureHost(host?: VivaAgentHost): VivaAgentHost {
  const resolved = host ?? getRemoteAgentHost();
  attachBuiltinPipelines(resolved);
  return resolved;
}

async function toolSession(args: Record<string, unknown>, host: VivaAgentHost) {
  const api = createSessionFacade(host);
  const action = String(args.action ?? "list");
  const sessionId = args.sessionId ? String(args.sessionId) : "";
  const includeIr = Boolean(args.includeIr);
  const meta: CompileMeta = {
    reason: (args.reason as CompileMeta["reason"]) ?? undefined,
    handbooks: args.handbookIds as string[] | undefined,
  };

  switch (action) {
    case "create":
      return textResult(
        JSON.stringify(
          api.create({
            handbooks: args.handbookIds as string[] | undefined,
            statePolicy: args.statePolicy as StatePolicy | undefined,
            title: args.title ? String(args.title) : undefined,
          }),
        ),
      );
    case "list":
      return textResult(JSON.stringify({ sessions: api.list() }));
    case "get":
      return textResult(JSON.stringify(api.get(sessionId)));
    case "compile": {
      const compiled = await api.compile(sessionId, String(args.source ?? ""), meta, includeIr);
      return textResult(JSON.stringify(compiled), !compiled.ok);
    }
    case "patch":
      return textResult(
        JSON.stringify(api.patch(sessionId, String(args.source ?? ""), meta, includeIr)),
      );
    case "world":
      return textResult(JSON.stringify(api.world(sessionId)));
    case "set":
      return textResult(
        JSON.stringify(
          api.set(
            sessionId,
            args.target === "state" ? "state" : "data",
            String(args.path ?? ""),
            args.value,
          ),
        ),
      );
    case "simulate":
      return textResult(
        JSON.stringify(
          api.simulate(sessionId, {
            ticks: typeof args.ticks === "number" ? args.ticks : 0,
          }),
        ),
      );
    case "provenance":
      return textResult(JSON.stringify({ sessionId, records: api.provenance(sessionId) }));
    case "bundle":
      return textResult(JSON.stringify(api.bundle(sessionId)));
    case "dispose":
      return textResult(JSON.stringify(api.dispose(sessionId)));
    default:
      return textResult(`Unknown viva_session action: ${action}`, true);
  }
}

async function toolPipeline(args: Record<string, unknown>, host: VivaAgentHost) {
  const api = createSessionFacade(host);
  const action = String(args.action ?? "list");
  switch (action) {
    case "list":
      return textResult(JSON.stringify({ pipelines: api.listPipelines() }));
    case "run": {
      const sessionId = String(args.sessionId ?? "");
      const id = String(args.id ?? "inline.set");
      const handle = await api.runPipeline(id, {
        sessionId,
        values: (args.values as Record<string, unknown> | undefined) ?? {},
      });
      return textResult(JSON.stringify(handle), handle.status === "error");
    }
    case "register":
      return textResult(
        JSON.stringify(
          api.registerPipeline({
            id: String(args.id ?? ""),
            title: String(args.title ?? args.id ?? "pipeline"),
            kind: args.kind === "inline" ? "inline" : "http-webhook",
            url: args.url ? String(args.url) : undefined,
          }),
        ),
      );
    case "cancel":
      return textResult(JSON.stringify(await api.cancelPipeline(String(args.runId ?? ""))));
    case "get":
      return textResult(JSON.stringify(api.getPipelineRun(String(args.runId ?? ""))));
    default:
      return textResult(`Unknown viva_pipeline action: ${action}`, true);
  }
}

export const MCP_TOOL_DEFINITIONS = [
  {
    name: "viva_compile",
    description: "Compile Viva source to Visual IR JSON (optional structural check).",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Viva source text" },
        handbookIds: { type: "array", items: { type: "string" }, description: "e.g. print-nature" },
        checkStructural: { type: "boolean" },
      },
      required: ["source"],
    },
  },
  {
    name: "viva_check",
    description: "Run structural / raster / vision QA on compiled figure.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string" },
        handbookIds: { type: "array", items: { type: "string" } },
        visual: { type: "boolean", description: "Raster ink heuristics" },
        vision: { type: "boolean", description: "Multimodal model (needs viva.models.json)" },
        width: { type: "number", description: "Raster width px" },
      },
      required: ["source"],
    },
  },
  {
    name: "viva_export",
    description:
      "Export artifact to svg|png|jpg|pdf. beats:true writes one PNG per layout.board __beat. format gif|mp4 stitches those frames with ffmpeg (slideshow, not a timeline).",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string" },
        format: { type: "string", enum: ["svg", "png", "jpg", "jpeg", "pdf", "pdf-raster", "gif", "mp4"] },
        handbookIds: { type: "array", items: { type: "string" } },
        width: { type: "number" },
        outputPath: { type: "string", description: "Optional file path to write bytes" },
        beats: { type: "boolean", description: "PNG sequence from layout.board __beat; gif|mp4 is a ffmpeg slideshow" },
      },
      required: ["source", "format"],
    },
  },
  {
    name: "viva_prompt",
    description: "System prompt + optional style handbooks for LLM generation.",
    inputSchema: {
      type: "object",
      properties: {
        handbookIds: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "viva_models",
    description: "Show resolved base/vision model configuration slots.",
    inputSchema: {
      type: "object",
      properties: {
        configPath: { type: "string" },
      },
    },
  },
  {
    name: "viva_session",
    description:
      "Headless VivaSession: create/compile/patch/world/set/simulate/provenance/bundle/dispose.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "create",
            "list",
            "get",
            "compile",
            "patch",
            "world",
            "set",
            "simulate",
            "provenance",
            "bundle",
            "dispose",
          ],
        },
        sessionId: { type: "string" },
        source: { type: "string" },
        handbookIds: { type: "array", items: { type: "string" } },
        statePolicy: { type: "string", enum: ["reset", "preserve", "preserve-data"] },
        title: { type: "string" },
        path: { type: "string" },
        target: { type: "string", enum: ["data", "state"] },
        value: {},
        ticks: { type: "number" },
        includeIr: { type: "boolean" },
        reason: {
          type: "string",
          enum: ["generate", "repair", "user-edit", "pipeline", "restore"],
        },
      },
      required: ["action"],
    },
  },
  {
    name: "viva_pipeline",
    description:
      "Run / list / register pipelines (inline.set or http-webhook) against a session.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["run", "list", "register", "cancel", "get"] },
        id: { type: "string" },
        sessionId: { type: "string" },
        values: { type: "object" },
        kind: { type: "string", enum: ["inline", "http-webhook"] },
        url: { type: "string" },
        title: { type: "string" },
        runId: { type: "string" },
      },
      required: ["action"],
    },
  },
] as const;

// Zod schemas for registerTool if using McpServer high-level API
export const mcpToolSchemas = {
  viva_compile: {
    source: z.string(),
    handbookIds: handbookIdsSchema,
    checkStructural: z.boolean().optional(),
  },
  viva_check: {
    source: z.string(),
    handbookIds: handbookIdsSchema,
    visual: z.boolean().optional(),
    vision: z.boolean().optional(),
    width: z.number().optional(),
  },
  viva_export: {
    source: z.string(),
    format: z.enum(["svg", "png", "jpg", "jpeg", "pdf", "pdf-raster", "gif", "mp4"]),
    handbookIds: handbookIdsSchema,
    width: z.number().optional(),
    outputPath: z.string().optional(),
    beats: z.boolean().optional(),
  },
  viva_prompt: {
    handbookIds: handbookIdsSchema,
  },
  viva_models: {
    configPath: z.string().optional(),
  },
  viva_session: {
    action: z.enum([
      "create",
      "list",
      "get",
      "compile",
      "patch",
      "world",
      "set",
      "simulate",
      "provenance",
      "bundle",
      "dispose",
    ]),
    sessionId: z.string().optional(),
    source: z.string().optional(),
    handbookIds: handbookIdsSchema,
    statePolicy: z.enum(["reset", "preserve", "preserve-data"]).optional(),
    title: z.string().optional(),
    path: z.string().optional(),
    target: z.enum(["data", "state"]).optional(),
    value: z.any().optional(),
    ticks: z.number().optional(),
    includeIr: z.boolean().optional(),
    reason: z
      .enum(["generate", "repair", "user-edit", "pipeline", "restore"])
      .optional(),
  },
  viva_pipeline: {
    action: z.enum(["run", "list", "register", "cancel", "get"]),
    id: z.string().optional(),
    sessionId: z.string().optional(),
    values: z.record(z.string(), z.any()).optional(),
    kind: z.enum(["inline", "http-webhook"]).optional(),
    url: z.string().optional(),
    title: z.string().optional(),
    runId: z.string().optional(),
  },
};
