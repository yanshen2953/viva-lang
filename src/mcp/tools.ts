import { z } from "zod";
import { compileSource } from "../pipeline.js";
import { runArtifactChecks } from "../check/index.js";
import { exportArtifact, type ExportFormat } from "../export/index.js";
import { SYSTEM_PROMPT } from "../llm/system-prompt.js";
import { createNodePromptService } from "../agent/prompt.node.js";
import { describeModelSlots, resolveModelsConfig } from "../check/models/index.js";

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
  const prompt = createNodePromptService();
  const parts = [SYSTEM_PROMPT];
  for (const id of handbookIds) {
    parts.push(prompt.loadHandbook(id));
  }
  return textResult(parts.join("\n\n---\n\n"));
}

function toolModels(args: Record<string, unknown>) {
  const configPath = args.configPath ? String(args.configPath) : undefined;
  return textResult(JSON.stringify(describeModelSlots(resolveModelsConfig(configPath)), null, 2));
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
    description: "Export artifact to svg|png|jpg|pdf. Returns base64 or writes outputPath.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string" },
        format: { type: "string", enum: ["svg", "png", "jpg", "jpeg", "pdf", "pdf-raster"] },
        handbookIds: { type: "array", items: { type: "string" } },
        width: { type: "number" },
        outputPath: { type: "string", description: "Optional file path to write bytes" },
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
    format: z.enum(["svg", "png", "jpg", "jpeg", "pdf", "pdf-raster"]),
    handbookIds: handbookIdsSchema,
    width: z.number().optional(),
    outputPath: z.string().optional(),
  },
  viva_prompt: {
    handbookIds: handbookIdsSchema,
  },
  viva_models: {
    configPath: z.string().optional(),
  },
};
