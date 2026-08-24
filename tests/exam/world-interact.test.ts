import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { evaluate } from "../../src/eval.js";
import { flattenNodesFromIr } from "../../src/export/static-svg.js";
import { simulate } from "../../src/simulate.js";

const WORLD_SCATTER = `artifact WorldPlot
data pts = [
  { x: 1, y: 2, grp: "A" }
  { x: 2, y: 4, grp: "B" }
]
scene
  size: 400 240
  layer ui
    node plotA
      role: plot
      x: 40
      y: 20
      w: 320
      h: 180
      xlim: 0 3
      ylim: 0 5
    for p in pts
      node pt as pts
        role: mark
        frame: plotA
        x: p.x
        y: p.y
        r: 6
        colorBy: grp
`;

describe("framed World marks share chart Runtime", () => {
  it("wires __tip / highlight / brush / compiler legend on data-field marks", () => {
    const result = compileSource(WORLD_SCATTER, "world-plot.viva");
    expect(result.error).toBeNull();
    expect(Object.keys(result.ir!.state)).toEqual(
      expect.arrayContaining(["__tip", "__hover", "__highlightGrp", "__sel", "__brush"]),
    );
    expect(result.ir!.events.some((e) => e.type === "hover" && e.target === "pts")).toBe(true);
    expect(result.ir!.events.some((e) => e.type === "dragstart" && e.target === "plotA_plotBg")).toBe(
      true,
    );
    expect(result.ir!.events.some((e) => e.type === "click" && e.target === "plotA_leg_0")).toBe(true);
    const hover = simulate(result.ir!, {
      events: [{ type: "hover", target: "pts", item: { x: 1, y: 2, grp: "A" } }],
    });
    expect(hover.state.__tip).toBe("A · 1, 2");
    expect(hover.state.__highlightGrp).toBe("A");
    const picked = simulate(result.ir!, {
      events: [{ type: "click", target: "plotA_leg_0" }],
    });
    expect(picked.state.__highlightGrp).toBe("A");
  });

  it("skips hover when the author already wrote one", () => {
    const result = compileSource(
      `${WORLD_SCATTER}
event hover on pts
  hint = "mine"
`,
      "world-hover.viva",
    );
    expect(result.error).toBeNull();
    const hovers = result.ir!.events.filter((e) => e.type === "hover" && e.target === "pts");
    expect(hovers).toHaveLength(1);
    expect(hovers[0]!.body.some((s) => s.kind === "assign" && s.target[0] === "hint")).toBe(true);
  });

  it("honors interactive: false on a framed mark", () => {
    const result = compileSource(
      `artifact Quiet
data pts = [{ x: 1, y: 2, grp: "A" }]
scene
  size: 320 200
  layer ui
    node plotA
      role: plot
      x: 20
      y: 10
      w: 280
      h: 180
      xlim: 0 3
      ylim: 0 5
    for p in pts
      node pt as pts
        role: mark
        frame: plotA
        x: p.x
        y: p.y
        r: 6
        colorBy: grp
        interactive: false
`,
      "quiet.viva",
    );
    expect(result.error).toBeNull();
    expect(result.ir!.events.some((e) => e.type === "hover" && e.target === "pts")).toBe(false);
    expect(result.ir!.events.some((e) => e.target.startsWith("plotA_leg_"))).toBe(false);
  });

  it("gives science-studio PCA the same hover without stealing the orbit drag", () => {
    const src = readFileSync("examples/science-studio.viva", "utf8");
    expect(src).not.toMatch(/node legA|cluster A|x: 824/);
    const result = compileSource(src, "science-studio.viva");
    expect(result.error).toBeNull();
    expect(result.ir!.events.some((e) => e.type === "hover" && e.target === "pcaPts")).toBe(true);
    expect(
      result.ir!.events.some((e) => e.type === "dragstart" && e.target === "pcaPlotBg_plotBg"),
    ).toBe(false);
    const hover = simulate(result.ir!, {
      events: [{ type: "hover", target: "pcaPts", item: { id: "A1", grp: "A", x: -1.4, y: 0.9 } }],
    });
    expect(hover.state.__tip).toBe("A1 · A");
    expect(hover.state.__highlightGrp).toBe("A");
    const plot = result.ir!.frames.find((f) => f.name === "pcaPlotBg")!;
    const plotY = evaluate(plot.props.y, [result.ir!.state, result.ir!.data]) as [number, number];
    const legend = flattenNodesFromIr(result.ir!).nodes.filter((n) => n.name.startsWith("pcaPlotBg_leg_"));
    expect(legend.length).toBeGreaterThanOrEqual(3);
    for (const node of legend) {
      expect(Number(node.props.y)).toBeGreaterThanOrEqual(plotY[1]!);
      expect(Number(node.props.y)).toBeLessThan(plotY[1]! + 28);
    }
    const pt = result.ir!.scene.layers
      .flatMap((l) => l.items)
      .flatMap((item) => (item.kind === "for" ? item.body : []))
      .find((n) => n.kind === "node" && n.name === "pcaPt");
    expect(pt?.kind).toBe("node");
    if (pt?.kind === "node") {
      expect(pt.props.scale).toBeTruthy();
      const lit = evaluate(pt.props.scale!, [{ __highlightGrp: "A", p: { grp: "A" } }]);
      const dim = evaluate(pt.props.scale!, [{ __highlightGrp: "A", p: { grp: "B" } }]);
      expect(Number(lit)).toBeGreaterThan(Number(dim));
    }
  });

  it("paints plot title and numeric stepper chips without author magic numbers", () => {
    const src = readFileSync("examples/science-studio.viva", "utf8");
    expect(src).not.toMatch(/node zoomIn|node pcaTitle|x: 1110|x: 1148/);
    const result = compileSource(src, "science-studio.viva");
    expect(result.error).toBeNull();
    const nodes = flattenNodesFromIr(result.ir!).nodes;
    const plot = result.ir!.frames.find((f) => f.name === "pcaPlotBg")!;
    const box = evaluate(plot.props.x, [result.ir!.state, result.ir!.data]) as [number, number];
    const boxY = evaluate(plot.props.y, [result.ir!.state, result.ir!.data]) as [number, number];
    const title = nodes.find((n) => n.name === "pcaPlotBg_title");
    expect(title).toBeTruthy();
    expect(String(title!.props.text)).toMatch(/PCA/);
    expect(Number(title!.props.y)).toBeGreaterThanOrEqual(boxY[0]! - 28);
    expect(Number(title!.props.y)).toBeLessThan(boxY[0]!);
    const plus = nodes.find((n) => n.name === "pcaPlotBg_ctl_1");
    expect(plus).toBeTruthy();
    expect(Number(plus!.props.x) + Number(plus!.props.w)).toBeLessThanOrEqual(box[1]! + 4);
    expect(Number(plus!.props.x)).toBeGreaterThan(box[0]!);
    const zoomed = simulate(result.ir!, {
      events: [{ type: "click", target: "pcaPlotBg_ctl_1" }],
    });
    expect(zoomed.state.zoom).toBeCloseTo(1.27);
    const out = simulate(result.ir!, {
      events: [
        { type: "click", target: "pcaPlotBg_ctl_0" },
        { type: "click", target: "pcaPlotBg_ctl_0" },
      ],
    });
    expect(out.state.zoom).toBeCloseTo(0.91);
  });

  it("increments a numeric board bind instead of writing + as a string", () => {
    const result = compileSource(
      `artifact StepBoard
state zoom = 1
scene
  size: 320 200
widget layout.board
  title: "step"
  controls: ["-", "+"]
  bind: zoom
  step: 0.25
  min: 0.5
  max: 2
`,
      "step-board.viva",
    );
    expect(result.error).toBeNull();
    const up = simulate(result.ir!, {
      events: [{ type: "click", target: "board_ctl_1" }],
    });
    expect(up.state.zoom).toBeCloseTo(1.25);
    const cap = simulate(result.ir!, {
      events: [
        { type: "click", target: "board_ctl_1" },
        { type: "click", target: "board_ctl_1" },
        { type: "click", target: "board_ctl_1" },
        { type: "click", target: "board_ctl_1" },
        { type: "click", target: "board_ctl_1" },
      ],
    });
    expect(cap.state.zoom).toBeCloseTo(2);
  });
});
