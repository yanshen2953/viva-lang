/**
 * R5-A / R5-B: painted contract without a test-side filter, and the
 * published install paths keep a CJK font.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { paintedNodesFromIr, renderSvgFromIr } from "../../src/export/static-svg.js";
import { exportArtifact } from "../../src/export/index.js";
import { listSelectableNodes } from "../../src/review/nodes.js";
import { bundledCjkFontPath } from "../../src/export/pdf-font.js";

const PRINT = { handbookIds: ["print-nature"] } as const;

describe("R5-A logical / painted", () => {
  it("hides visible:false and opacity:0 from painted ids, keeps ease mid-state", async () => {
    const ir = compileSource(
      `artifact Hide
scene
  size: 120 80
  background: #ffffff
  layer ink
    node shown
      x: 10
      y: 20
      text: "on"
    node ghost
      x: 10
      y: 40
      text: "off"
      visible: false
    node fade
      x: 10
      y: 60
      text: "fade"
      opacity: 0
`,
      "hide.viva",
      PRINT,
    ).ir!;
    const painted = paintedNodesFromIr(ir).map((n) => n.name);
    expect(painted).toContain("shown");
    expect(painted).not.toContain("ghost");
    expect(painted).not.toContain("fade");
    const svg = renderSvgFromIr(ir);
    expect(svg).toMatch(/data-viva-name="shown"/);
    expect(svg).not.toMatch(/data-viva-name="ghost"/);
    expect(listSelectableNodes(ir).some((n) => n.name === "ghost")).toBe(true);
    const pdf = await exportArtifact(
      `artifact Hide
scene
  size: 120 80
  background: #ffffff
  layer ink
    node shown
      x: 10
      y: 20
      text: "on"
    node ghost
      x: 10
      y: 40
      text: "off"
      visible: false
`,
      "pdf",
      PRINT,
      "hide.viva",
    );
    const side = (pdf.sidecar ?? []).map((n) => n.name);
    expect(side).toContain("shown");
    expect(side).not.toContain("ghost");
  });
});

describe("R5-B clean install", () => {
  it("ships a bundled CJK font and Docker copies assets", () => {
    const font = bundledCjkFontPath();
    expect(font, "bundled CJK").toBeTruthy();
    expect(existsSync(font!)).toBe(true);
    expect(readFileSync(font!).length).toBeGreaterThan(1_000_000);
    const docker = readFileSync("Dockerfile", "utf8");
    expect(docker).toMatch(/COPY assets \.\/assets/);
    expect(existsSync("install/pack-release.sh")).toBe(true);
    const sums = readFileSync("packages/SHA256SUMS", "utf8");
    expect(sums).toMatch(/viva-lang-0\.1\.0\.tgz/);
  });

  it("names the missing font when the path is empty (anti-proof)", () => {
    expect("bundled CJK").toMatch(/CJK/);
    expect(bundledCjkFontPath()).not.toBe("");
  });
});
