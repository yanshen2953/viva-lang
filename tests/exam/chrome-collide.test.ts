import { describe, expect, it } from "vitest";
import { compileSource } from "../../src/pipeline.js";
import { evaluate } from "../../src/eval.js";
import {
  estimateTextWidthPx,
  placePaperChrome,
  rectsOverlap,
} from "../../src/layout/chrome-collide.js";

describe("paper chrome collision", () => {
  it("nudges a rotated y-title left of measured y-tick boxes", () => {
    const { chrome, rects } = placePaperChrome(
      { px0: 80, px1: 360, py0: 40, py1: 220 },
      (px) => px,
      false,
      {
        yCaption: "Concentration (µM)",
        yTicks: [
          { label: "10000", y: 50 },
          { label: "5000", y: 120 },
          { label: "0", y: 210 },
        ],
        xTicks: [{ label: "0", x: 80 }, { label: "10", x: 360 }],
      },
    );
    const yTitle = rects.find((r) => r.id === "yTitle")!;
    const ticks = rects.filter((r) => r.id.startsWith("ytick-"));
    expect(yTitle).toBeTruthy();
    expect(ticks.length).toBe(3);
    for (const tick of ticks) {
      expect(rectsOverlap(yTitle, tick, 1)).toBe(false);
    }
    expect(chrome.yTitleX).toBeLessThan(chrome.yTickX);
  });

  it("shifts a chart title right of the (a) panel label", () => {
    const { chrome, rects } = placePaperChrome(
      { px0: 20, px1: 300, py0: 24, py1: 200 },
      (px) => px,
      false,
      {
        title: "RESPONSE BY VISIT",
        panelLabel: "(a)",
        yTicks: [{ label: "0", y: 190 }],
        xTicks: [{ label: "1", x: 40 }],
      },
      { x0: 0, y0: 0, x1: 320, y1: 220 },
    );
    const title = rects.find((r) => r.id === "title")!;
    const label = rects.find((r) => r.id === "panel-label")!;
    expect(title).toBeTruthy();
    expect(label).toBeTruthy();
    expect(rectsOverlap(title, label, 1)).toBe(false);
    expect(chrome.titleX).toBeGreaterThan(label.x + label.w);
  });

  it("keeps a right legend clear of the colorbar", () => {
    const { rects } = placePaperChrome(
      { px0: 40, px1: 220, py0: 30, py1: 200 },
      (px) => px,
      false,
      {
        colorbar: true,
        cbarLabels: ["0.00", "4.00"],
        legendAt: "right",
        legendKeys: ["high", "mid", "low"],
        yTicks: [{ label: "0", y: 190 }],
        xTicks: [{ label: "1", x: 80 }],
      },
      { x0: 0, y0: 0, x1: 360, y1: 240 },
    );
    const cbar = rects.find((r) => r.id === "cbar")!;
    const legends = rects.filter((r) => r.id.startsWith("legend-"));
    expect(cbar).toBeTruthy();
    expect(legends.length).toBe(3);
    for (const legend of legends) {
      expect(rectsOverlap(cbar, legend, 1)).toBe(false);
    }
  });

  it("compiles a labeled panel so title and (a) boxes do not overlap", () => {
    const result = compileSource(
      `artifact Collide
data series = [{ x: 1, y: 20 }, { x: 2, y: 40 }]
scene
  size: 480 280
  background: #ffffff
widget layout.figure
  cols: 1
  rows: 1
  gutter: 8
  margin: 8
widget chart.line
  panel: a
  data: series
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 50
  xLabel: Time
  xUnit: week
  yLabel: Score
  title: "RESPONSE BY VISIT"
  interactive: false
`,
      "collide.viva",
      { handbookIds: ["print-nature"] },
    );
    expect(result.error).toBeNull();
    const ir = result.ir!;
    const env = [ir.state, ir.data];
    const nodes = ir.scene.layers.flatMap((l) => l.items.filter((i) => i.kind === "node"));
    const title = nodes.find((n) => n.kind === "node" && n.name === "a_title");
    const label = nodes.find((n) => n.kind === "node" && /_lab_a$/.test(n.name));
    expect(title?.kind).toBe("node");
    expect(label?.kind).toBe("node");
    if (title?.kind === "node" && label?.kind === "node") {
      const tx = evaluate(title.props.x, env) as number;
      const ty = evaluate(title.props.y, env) as number;
      const lx = evaluate(label.props.x, env) as number;
      const ly = evaluate(label.props.y, env) as number;
      const titleText = evaluate(title.props.text, env) as string;
      const labelText = evaluate(label.props.text, env) as string;
      const titleBox = {
        id: "t",
        x: tx,
        y: ty - 12 * 0.75,
        w: estimateTextWidthPx(titleText, 12, 0.35),
        h: 12,
      };
      const labelBox = {
        id: "l",
        x: lx,
        y: ly - 11,
        w: estimateTextWidthPx(labelText, 11, 0.15),
        h: 13,
      };
      expect(rectsOverlap(titleBox, labelBox, 1)).toBe(false);
    }
  });
});
