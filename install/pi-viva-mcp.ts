/**
 * Pi extension: register Viva MCP tools.
 *
 * Pi 0.73 has no built-in MCP client. This extension spawns `viva mcp` over
 * stdio (official SDK) and forwards tool calls — same surface as Cursor.
 *
 *   pi --no-extensions -e install/pi-viva-mcp.ts --no-builtin-tools \
 *      --tools viva_compile,viva_check,viva_session,viva_prompt
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionAPI } from "@mariozechner/pi-coding-agent";

type VivaMcpSession = {
  listTools: () => Promise<string[]>;
  callTool: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ text: string; isError: boolean }>;
  close: () => Promise<void>;
};

const GUIDELINES = [
  "After drafting Viva source, call viva_compile (visual:false while iterating).",
  "If success/ok is false, visualOk is false, or ir.data is empty, fix the source and compile again.",
  "Entities must be data-backed: data NAME = [...]. State alone is not a table.",
  "When finished, output ONLY the full Viva source starting with artifact.",
];

async function loadConnect(
  root: string,
): Promise<(opts?: { cwd?: string }) => Promise<VivaMcpSession>> {
  const dist = path.join(root, "dist/mcp/stdio-client.js");
  if (existsSync(dist)) {
    const mod = (await import(pathToFileURL(dist).href)) as {
      connectVivaMcp: (opts?: { cwd?: string }) => Promise<VivaMcpSession>;
    };
    return mod.connectVivaMcp;
  }
  const { createJiti } = await import("jiti");
  const jiti = createJiti(path.join(root, "package.json"));
  const mod = (await jiti.import(path.join(root, "src/mcp/stdio-client.ts"))) as {
    connectVivaMcp: (opts?: { cwd?: string }) => Promise<VivaMcpSession>;
  };
  return mod.connectVivaMcp;
}

export default function (pi: ExtensionAPI) {
  const root = process.env.VIVA_ROOT ?? process.cwd();
  let session: VivaMcpSession | null = null;
  let connecting: Promise<VivaMcpSession> | null = null;

  const ensure = async () => {
    if (session) return session;
    if (!connecting) {
      connecting = (async () => {
        const connect = await loadConnect(root);
        const s = await connect({ cwd: root });
        session = s;
        return s;
      })().catch((err) => {
        connecting = null;
        throw err;
      });
    }
    return connecting;
  };

  const execute =
    (name: string) =>
    async (
      _id: string,
      params: Record<string, unknown>,
    ): Promise<{ content: { type: "text"; text: string }[]; details: { mcp: string; isError: boolean } }> => {
      const mcp = await ensure();
      const result = await mcp.callTool(name, params);
      return {
        content: [{ type: "text", text: result.text || "(empty MCP result)" }],
        details: { mcp: name, isError: result.isError },
      };
    };

  const handbookIds = Type.Optional(Type.Array(Type.String({ description: "e.g. print-nature" })));

  pi.registerTool(
    defineTool({
      name: "viva_compile",
      label: "Viva compile",
      description:
        "MCP viva_compile: source → IR JSON. visual:false skips raster. Empty ir.data means entities are not data-backed.",
      promptSnippet: "Compile Viva source via MCP (viva mcp stdio).",
      promptGuidelines: GUIDELINES,
      parameters: Type.Object({
        source: Type.String({ description: "Viva source text" }),
        handbookIds,
        checkStructural: Type.Optional(Type.Boolean()),
        visual: Type.Optional(Type.Boolean({ description: "Raster QA (default true; use false while drafting)" })),
      }),
      execute: execute("viva_compile"),
    }),
  );

  pi.registerTool(
    defineTool({
      name: "viva_check",
      label: "Viva check",
      description: "MCP viva_check: structural / raster / vision QA.",
      parameters: Type.Object({
        source: Type.String(),
        handbookIds,
        visual: Type.Optional(Type.Boolean()),
        vision: Type.Optional(Type.Boolean()),
        width: Type.Optional(Type.Number()),
      }),
      execute: execute("viva_check"),
    }),
  );

  pi.registerTool(
    defineTool({
      name: "viva_prompt",
      label: "Viva prompt",
      description: "MCP viva_prompt: system prompt + optional handbooks.",
      parameters: Type.Object({
        handbookIds,
      }),
      execute: execute("viva_prompt"),
    }),
  );

  pi.registerTool(
    defineTool({
      name: "viva_session",
      label: "Viva session",
      description:
        "MCP viva_session: create/compile/patch/world/set/simulate/provenance/bundle/dispose.",
      parameters: Type.Object({
        action: Type.String({
          description: "create|list|get|compile|patch|world|set|simulate|provenance|bundle|dispose",
        }),
        sessionId: Type.Optional(Type.String()),
        source: Type.Optional(Type.String()),
        handbookIds,
        statePolicy: Type.Optional(Type.String()),
        title: Type.Optional(Type.String()),
        path: Type.Optional(Type.String()),
        target: Type.Optional(Type.String()),
        value: Type.Optional(Type.Any()),
        ticks: Type.Optional(Type.Number()),
        includeIr: Type.Optional(Type.Boolean()),
        reason: Type.Optional(Type.String()),
      }),
      execute: execute("viva_session"),
    }),
  );
}
