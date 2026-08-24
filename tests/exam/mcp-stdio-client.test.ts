import { describe, expect, it } from "vitest";
import { connectVivaMcp, resolveVivaMcpCommand } from "../../src/mcp/stdio-client.js";

const HELLO = `artifact "StdioMCP"
data series = [{ x: 1, y: 2 }, { x: 2, y: 3 }]
scene
  background: #ffffff
  layer a
    node t
      x: 10
      y: 10
      w: 80
      h: 40
      fill: #111111
      text: "ok"
widget chart.scatter
  data: series
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 4
`;

describe("Viva MCP stdio client (Pi bridge)", () => {
  it("resolves a local mcp command", () => {
    const cmd = resolveVivaMcpCommand();
    expect(cmd.args.at(-1)).toBe("mcp");
    expect(cmd.command.length).toBeGreaterThan(0);
  });

  it("lists tools and compiles over official MCP stdio", async () => {
    const session = await connectVivaMcp();
    try {
      const names = await session.listTools();
      expect(names).toEqual(
        expect.arrayContaining(["viva_compile", "viva_check", "viva_session", "viva_prompt"]),
      );
      const compiled = await session.callTool("viva_compile", {
        source: HELLO,
        visual: false,
      });
      expect(compiled.isError).toBe(false);
      const json = JSON.parse(compiled.text);
      expect(json.ir?.name).toBe("StdioMCP");
      expect(json.hints ?? []).toEqual([]);
    } finally {
      await session.close();
    }
  }, 30_000);
});
