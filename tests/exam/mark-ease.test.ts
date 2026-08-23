import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { evaluate } from "../../src/eval.js";
import { applyMarkPaintCss, MARK_EASE_MS, markPaintState } from "../../src/runtime/mark-ease.js";
import { exportArtifact } from "../../src/export/index.js";

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
