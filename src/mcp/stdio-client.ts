import { existsSync } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export type VivaMcpCommand = {
  command: string;
  args: string[];
  cwd: string;
};

export type VivaMcpSession = {
  listTools: () => Promise<string[]>;
  callTool: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ text: string; isError: boolean }>;
  close: () => Promise<void>;
};

/** Exam + Pi extension allowlist (no bash/edit; no heavy export). */
export const PI_VIVA_MCP_TOOLS = [
  "viva_compile",
  "viva_check",
  "viva_session",
  "viva_prompt",
] as const;

export function resolveVivaMcpCommand(root = process.cwd()): VivaMcpCommand {
  const cwd = process.env.VIVA_ROOT ?? root;
  const override = process.env.VIVA_MCP_COMMAND?.trim();
  if (override) {
    const parts = override.split(/\s+/).filter(Boolean);
    return { command: parts[0] ?? "viva", args: parts.slice(1), cwd };
  }
  const distCli = path.join(cwd, "dist/cli.js");
  if (existsSync(distCli)) {
    return { command: process.execPath, args: [distCli, "mcp"], cwd };
  }
  const srcCli = path.join(cwd, "src/cli.ts");
  const viteNode = path.join(cwd, "node_modules/.bin/vite-node");
  if (existsSync(viteNode) && existsSync(srcCli)) {
    return { command: viteNode, args: [srcCli, "mcp"], cwd };
  }
  if (existsSync(srcCli)) {
    return { command: "npx", args: ["vite-node", srcCli, "mcp"], cwd };
  }
  return { command: "viva", args: ["mcp"], cwd };
}

function spawnEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function flattenToolText(content: unknown): string {
  if (!Array.isArray(content)) return String(content ?? "");
  return content
    .map((part) => {
      if (part && typeof part === "object" && "text" in part) {
        return String((part as { text: unknown }).text ?? "");
      }
      return JSON.stringify(part);
    })
    .join("\n")
    .trim();
}

/**
 * Spawn `viva mcp` over stdio and speak MCP (same tools as Cursor / Claude Desktop).
 * Pi 0.73 has no built-in MCP client; the exam extension wraps this session.
 */
export async function connectVivaMcp(
  opts: { cwd?: string } = {},
): Promise<VivaMcpSession> {
  const { command, args, cwd } = resolveVivaMcpCommand(opts.cwd ?? process.cwd());
  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    env: spawnEnv(),
    stderr: "pipe",
  });
  const client = new Client({ name: "viva-pi-mcp", version: "0.1.0" });
  await client.connect(transport);

  return {
    async listTools() {
      const listed = await client.listTools();
      return listed.tools.map((t) => t.name);
    },
    async callTool(name, args = {}) {
      const result = await client.callTool({ name, arguments: args });
      return {
        text: flattenToolText(result.content),
        isError: Boolean(result.isError),
      };
    },
    async close() {
      await client.close();
    },
  };
}
