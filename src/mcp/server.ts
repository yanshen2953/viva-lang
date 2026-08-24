import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { handleMcpTool, mcpToolSchemas } from "./tools.js";

export async function runVivaMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "viva-lang",
    version: "0.1.0",
  });

  server.registerTool(
    "viva_compile",
    {
      description: "Compile Viva source to Visual IR JSON (optional structural check).",
      inputSchema: mcpToolSchemas.viva_compile,
    },
    async (args) => handleMcpTool("viva_compile", args),
  );

  server.registerTool(
    "viva_check",
    {
      description: "Structural / raster / vision QA on a Viva figure.",
      inputSchema: mcpToolSchemas.viva_check,
    },
    async (args) => handleMcpTool("viva_check", args),
  );

  server.registerTool(
    "viva_export",
    {
      description: "Export Viva artifact to svg|png|jpg|pdf.",
      inputSchema: mcpToolSchemas.viva_export,
    },
    async (args) => handleMcpTool("viva_export", args),
  );

  server.registerTool(
    "viva_prompt",
    {
      description: "Core system prompt + optional style handbooks.",
      inputSchema: mcpToolSchemas.viva_prompt,
    },
    async (args) => handleMcpTool("viva_prompt", args),
  );

  server.registerTool(
    "viva_models",
    {
      description: "Resolved base/vision model slots from viva.models.json.",
      inputSchema: mcpToolSchemas.viva_models,
    },
    async (args) => handleMcpTool("viva_models", args),
  );

  server.registerTool(
    "viva_capabilities",
    {
      description: "Registered widgets, compile hooks, handbooks, events, and scene properties.",
      inputSchema: mcpToolSchemas.viva_capabilities,
    },
    async (args) => handleMcpTool("viva_capabilities", args),
  );

  server.registerTool(
    "viva_session",
    {
      description:
        "Headless VivaSession: create/compile/patch/world/set/simulate/provenance/bundle.",
      inputSchema: mcpToolSchemas.viva_session,
    },
    async (args) => handleMcpTool("viva_session", args),
  );

  server.registerTool(
    "viva_pipeline",
    {
      description: "Run or register pipelines (inline.set / http-webhook) on a session.",
      inputSchema: mcpToolSchemas.viva_pipeline,
    },
    async (args) => handleMcpTool("viva_pipeline", args),
  );

  server.registerPrompt(
    "viva_generate",
    {
      description: "Prompt template for generating a new Viva artifact.",
      argsSchema: {
        task: z.string().optional(),
        handbook: z.string().optional(),
      },
    },
    async ({ task, handbook }) => {
      const handbookIds = handbook ? [handbook] : ["print-nature"];
      const bundle = await handleMcpTool("viva_prompt", { handbookIds });
      const system = bundle.content[0]?.text ?? "";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `${system}\n\n---\n\nUser task: ${task ?? "Create an interactive Viva artifact."}\n\nOutput Viva source only.`,
            },
          },
        ],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
