import { describe, expect, it } from "vitest";
import { handleMcpTool } from "../../src/mcp/tools.js";

const HELLO = `artifact "MCP"
scene
  layer a
    node t
      x: 10
      y: 10
      text: "ok"
`;

describe("MCP tools", () => {
  it("viva_compile returns IR", async () => {
    const out = await handleMcpTool("viva_compile", { source: HELLO });
    expect(out.isError).toBeFalsy();
    const json = JSON.parse(out.content[0]!.text);
    expect(json.ir?.name).toBe("MCP");
  });

  it("viva_prompt includes system prompt", async () => {
    const out = await handleMcpTool("viva_prompt", { handbookIds: [] });
    expect(out.content[0]!.text).toContain("Viva");
  });

  it("viva_check structural pass", async () => {
    const out = await handleMcpTool("viva_check", { source: HELLO, visual: false });
    const json = JSON.parse(out.content[0]!.text);
    expect(json.ok).toBe(true);
  });
});
