import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { evaluate } from "../../src/eval.js";
import {
  applyMarkPaintCss,
  isSummaryMark,
  paintIsClockDriven,
  lerpPathD,
  MARK_EASE_MS,
  markPaintState,
  pickGeom,
  sampleGeomEase,
  samplePathEase,
} from "../../src/runtime/mark-ease.js";
import { nodeIgnoresPointer } from "../../src/runtime/pointer.js";
import { gaussianKDE, violinPathD } from "../../src/layout/violin-density.js";
import { exportArtifact } from "../../src/export/index.js";
import { flattenNodesFromIr } from "../../src/export/static-svg.js";
import { applyViewState, guardView } from "../../src/runtime/view-machine.js";

describe("runtime mark ease and paper raster background", () => {
  it("keeps hidden marks painted at opacity 0 so they can fade", () => {
    const shown = markPaintState(true, 0.4);
    expect(shown.opacity).toBe(0.4);
    expect(shown.hideAfterMs).toBeNull();
    expect(shown.pointerEvents).toBe("");
    const hidden = markPaintState(false, 1);
    expect(hidden.opacity).toBe(0);
    expect(hidden.hideAfterMs).toBe(MARK_EASE_MS);
    expect(hidden.pointerEvents).toBe("none");
    expect(hidden.transform).toBe("none");
    const lit = markPaintState(true, 1, 1.18);
    expect(lit.transform).toBe("scale(1.18)");
    expect(lit.transition).toMatch(/transform/);
  });

  it("eases summary line endpoints toward a hopped __sel target", () => {
    expect(isSummaryMark({ __lineData: "rows" })).toBe(true);
    expect(isSummaryMark({ x: 1 })).toBe(false);
    const from = pickGeom({ x1: 10, y1: 20, x2: 40, y2: 20 });
    const to = pickGeom({ x1: 10, y1: 20, x2: 80, y2: 12 });
    const start = sampleGeomEase(from, to, 0, undefined, 220);
    const mid = sampleGeomEase(start.values, to, 110, start.running, 220);
    expect(mid.running).toBeTruthy();
    expect(mid.values.x2).toBeGreaterThan(40);
    expect(mid.values.x2).toBeLessThan(80);
    const done = sampleGeomEase(mid.values, to, 400, mid.running, 220);
    expect(done.running).toBeUndefined();
    expect(done.values.x2).toBe(80);
    expect(done.values.y2).toBe(12);
  });

  it("eases matching violin path numbers toward a __sel density", () => {
    const from = violinPathD(40, gaussianKDE([8, 10, 12], 0, 20, 16), 0, 20, 120, 20, "linear", 18);
    const to = violinPathD(40, gaussianKDE([14, 16], 0, 20, 16), 0, 20, 120, 20, "linear", 18);
    expect(from).not.toBe(to);
    const start = samplePathEase(from, to, 0, undefined, 220);
    const mid = samplePathEase(start.value, to, 110, start.running, 220);
    expect(mid.running).toBeTruthy();
    expect(mid.value).not.toBe(from);
    expect(mid.value).not.toBe(to);
    const midNums = [...mid.value.matchAll(/[-+]?(?:\d*\.\d+|\d+)/g)].map((m) => Number(m[0]));
    const fromNums = [...from.matchAll(/[-+]?(?:\d*\.\d+|\d+)/g)].map((m) => Number(m[0]));
    const toNums = [...to.matchAll(/[-+]?(?:\d*\.\d+|\d+)/g)].map((m) => Number(m[0]));
    expect(midNums.length).toBe(fromNums.length);
    expect(midNums.some((n, i) => n !== fromNums[i] && n !== toNums[i])).toBe(true);
    const done = samplePathEase(mid.value, to, 400, mid.running, 220);
    expect(done.running).toBeUndefined();
    expect(done.value).toBe(to);
    expect(lerpPathD("M 0 0 L 10 0", "M 0 0 C 1 1 2 2 3 3", 0.5)).toBeNull();
  });

  it("static flatten samples __easeU the same way Runtime does", () => {
    const src = `artifact Ease
data rows = [{ x: 0, y: 1 }, { x: 1, y: 2 }]
scene
  size: 240 160
widget chart.bar
  data: rows
  xField: x
  yField: y
`;
    const result = compileSource(src, "ease.viva");
    expect(result.error).toBeNull();
    const ir = structuredClone(result.ir!);
    const end = flattenNodesFromIr(ir).nodes.filter((n) => n.props.__chartBar);
    expect(end.length).toBeGreaterThan(0);
    const first = end[0]!;
    const targetW = Number(first.props.w ?? first.props.h ?? 8);
    const from = { ...pickGeom(first.props), w: targetW * 0.2 };
    ir.state.__easeU = 0.5;
    ir.state.__easeFrom = { [first.id]: from, [first.name]: from };
    const mid = flattenNodesFromIr(ir).nodes.find((n) => n.id === first.id);
    const midW = Number(mid?.props.w);
    expect(midW).toBeGreaterThan(from.w);
    expect(midW).toBeLessThan(targetW + 1e-9);
    expect(Math.abs(midW - targetW)).toBeGreaterThan(1e-6);
  });

  it("view machine guards brush → selected → linked", () => {
    expect(guardView("idle", "brush")).toBe("brushing");
    expect(guardView("idle", "hover")).toBe("hover");
    expect(guardView("hover", "drag")).toBe("dragging");
    expect(guardView("playing", "pause")).toBe("paused");
    expect(guardView("paused", "play")).toBe("playing");
    expect(guardView("brushing", "release")).toBe("selected");
    expect(guardView("selected", "link")).toBe("linked");
    const state: Record<string, unknown> = {
      __brush: { on: false, frame: "a" },
      __sel: { n: 2, page: 1 },
    };
    const snap = applyViewState(state);
    expect(snap.phase).toBe("linked");
    expect(snap.page).toBe(1);
    expect(state.__page).toBe(1);
  });

  it("writes style.opacity so play veils and hidden marks can CSS-ease", () => {
    const shown = markPaintState(true, 0.55);
    const hidden = markPaintState(true, 0);
    const style = {
      transition: "",
      transformBox: "",
      transformOrigin: "",
      transform: "",
      pointerEvents: "",
      display: "",
      opacity: "",
    };
    const attrs: Record<string, string> = {};
    const el = { style, setAttribute: (k: string, v: string) => { attrs[k] = v; } };
    applyMarkPaintCss(el, shown);
    expect(style.opacity).toBe("0.55");
    expect(attrs.opacity).toBe("0.55");
    expect(style.transition).toMatch(/opacity/);
    applyMarkPaintCss(el, hidden);
    expect(style.opacity).toBe("0");
    expect(paintIsClockDriven("board_veil_2")).toBe(true);
    expect(paintIsClockDriven("mark")).toBe(false);
    applyMarkPaintCss(el, shown, true);
    expect(style.transition).toBe("none");
    expect(style.opacity).toBe("0.55");
  });

  it("lets dimmed play veils pass pointer through to the shot underneath", () => {
    expect(nodeIgnoresPointer("board_veil_2", "hud")).toBe(true);
    expect(nodeIgnoresPointer("board_veil_2", "chrome")).toBe(true);
    expect(nodeIgnoresPointer("chartTip", "label")).toBe(true);
    expect(nodeIgnoresPointer("mark", "mark")).toBe(false);
  });

  it("compiles a group highlight scale onto scatter marks", () => {
    const result = compileSource(
      `artifact Ease
data rows = [
  { x: 1, y: 2, grp: "a" }
  { x: 2, y: 4, grp: "b" }
]
scene
  size: 240 160
  background: #ffffff
widget chart.scatter
  data: rows
  xField: x
  yField: y
  group: grp
  xlim: 0 3
  ylim: 0 5
  interactive: true
`,
      "ease.viva",
      { handbookIds: ["print-nature"] },
    );
    expect(result.error).toBeNull();
    const marks = result.ir!.scene.layers
      .flatMap((l) => l.items)
      .filter((i) => i.kind === "for")
      .flatMap((i) => (i.kind === "for" ? i.body : []))
      .find((n) => n.kind === "node" && n.name === "mark");
    expect(marks?.kind).toBe("node");
    if (marks?.kind !== "node") return;
    expect(marks.props.scale).toBeTruthy();
    const lit = evaluate(marks.props.scale!, [{ __highlightGrp: "a", row: { grp: "a" } }, {}, {}]);
    const dim = evaluate(marks.props.scale!, [{ __highlightGrp: "a", row: { grp: "b" } }, {}, {}]);
    expect(lit).toBeCloseTo(1.18);
    expect(dim).toBe(1);
  });

  it("fills print-nature PNG corners with the scene background, not a hole", async () => {
    const src = readFileSync("examples/paper-cjk.viva", "utf8");
    const png = await exportArtifact(
      src,
      "png",
      { width: 336, handbookIds: ["print-nature"] },
      "paper-cjk.viva",
    );
    const { data, info } = await sharp(Buffer.from(png.bytes))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    const corner = (x: number, y: number) => {
      const i = (y * info.width! + x) * 4;
      return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    };
    for (const [r, g, b, a] of [corner(0, 0), corner(info.width! - 1, 0)]) {
      expect(a).toBe(255);
      expect(r).toBeGreaterThan(240);
      expect(g).toBeGreaterThan(240);
      expect(b).toBeGreaterThan(240);
    }
  }, 30_000);
});
