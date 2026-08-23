import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { handleMcpTool } from "../../src/mcp/tools.js";
import { ffmpegAvailable } from "../../src/export/index.js";

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
    expect(typeof json.visualOk).toBe("boolean");
    expect(Array.isArray(json.visual)).toBe(true);
  });

  it("viva_compile marks an inked paper figure visualOk", async () => {
    const out = await handleMcpTool("viva_compile", {
      source: readFileSync("examples/paper-column.viva", "utf8"),
      handbookIds: ["print-nature"],
    });
    const json = JSON.parse(out.content[0]!.text);
    expect(json.ir?.name).toBeTruthy();
    expect(json.visualOk).toBe(true);
  }, 30_000);

  it("viva_compile visual:false skips the raster", async () => {
    const out = await handleMcpTool("viva_compile", { source: HELLO, visual: false });
    const json = JSON.parse(out.content[0]!.text);
    expect(json.ir?.name).toBe("MCP");
    expect(json.visualOk).toBeUndefined();
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

  it("viva_export beats returns one PNG per layout.board __beat", async () => {
    const src = `artifact "Beats"
data a = [{ x: 0, y: 2 }, { x: 1, y: 4 }]
data b = [{ x: 0, y: 6 }, { x: 1, y: 1 }]
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
  ylim: 0 8
  interactive: false
widget chart.line
  panel: beat1
  data: b
  xField: x
  yField: y
  xlim: 0 1
  ylim: 0 8
  interactive: false
`;
    const out = await handleMcpTool("viva_export", {
      source: src,
      format: "png",
      width: 160,
      beats: true,
      handbookIds: ["print-nature"],
    });
    expect(out.isError).toBeFalsy();
    const json = JSON.parse(out.content[0]!.text);
    expect(json.ok).toBe(true);
    expect(json.beats).toBe(2);
    expect(json.frames).toHaveLength(2);
    expect(json.frames[0].bytes).toBeGreaterThan(80);
    expect(json.frames[0].base64).not.toBe(json.frames[1].base64);
  }, 30_000);

  it("viva_export beats+gif stitches a ffmpeg slideshow", async ({ skip }) => {
    if (!(await ffmpegAvailable())) skip();
    const src = `artifact "BeatsGif"
data a = [{ x: 0, y: 2 }, { x: 1, y: 4 }]
data b = [{ x: 0, y: 6 }, { x: 1, y: 1 }]
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
  ylim: 0 8
  interactive: false
widget chart.line
  panel: beat1
  data: b
  xField: x
  yField: y
  xlim: 0 1
  ylim: 0 8
  interactive: false
`;
    const out = await handleMcpTool("viva_export", {
      source: src,
      format: "gif",
      width: 160,
      beats: true,
      handbookIds: ["print-nature"],
    });
    expect(out.isError).toBeFalsy();
    const json = JSON.parse(out.content[0]!.text);
    expect(json.ok).toBe(true);
    expect(json.mime).toBe("image/gif");
    expect(json.bytes).toBeGreaterThan(80);
    const raw = Buffer.from(json.base64, "base64");
    expect(raw.subarray(0, 6).toString("ascii")).toBe("GIF89a");
  }, 45_000);
});
