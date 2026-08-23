import { describe, expect, it } from "vitest";
import { compileSource } from "../../src/pipeline.js";
import { evaluate } from "../../src/eval.js";
import { estimateBoardBands, estimateSafeMargin } from "../../src/layout/board-chrome.js";

describe("layout.board chrome from copy", () => {
  it("estimates safe from the short scene side", () => {
    expect(estimateSafeMargin(1360, 920)).toBe(41);
    expect(estimateSafeMargin(240, 160)).toBe(16);
  });

  it("grows the title band when a long title wraps", () => {
    const short = estimateBoardBands({
      width: 640,
      height: 400,
      title: "Short",
      hasTitle: true,
      hasSubtitle: false,
      hasCaption: false,
      controlKeys: [],
      hasBind: false,
    });
    const long = estimateBoardBands({
      width: 240,
      height: 400,
      title: "Very long board title that must wrap across the leftover safe column",
      hasTitle: true,
      hasSubtitle: false,
      hasCaption: false,
      controlKeys: [],
      hasBind: false,
    });
    expect(long.titleLines.length).toBeGreaterThan(1);
    expect(long.titleH).toBeGreaterThan(short.titleH);
    expect(long.safe).toBeGreaterThanOrEqual(16);
  });

  it("does not reserve title/lower bands when there is no copy", () => {
    const empty = estimateBoardBands({
      width: 1280,
      height: 720,
      hasTitle: false,
      hasSubtitle: false,
      hasCaption: false,
      controlKeys: [],
      hasBind: false,
    });
    expect(empty.titleH).toBe(0);
    expect(empty.lowerH).toBe(0);
    expect(empty.safe).toBe(estimateSafeMargin(1280, 720));
  });

  it("sizes chips from key text instead of a fixed 52px tile", () => {
    const bands = estimateBoardBands({
      width: 800,
      height: 400,
      title: "Board",
      hasTitle: true,
      hasSubtitle: false,
      hasCaption: false,
      controlKeys: ["A", "placebo-control"],
      hasBind: true,
    });
    expect(bands.chipWs[1]!).toBeGreaterThan(bands.chipWs[0]!);
    expect(bands.hudW).toBeGreaterThan(bands.chipWs[0]! + bands.chipWs[1]!);
    expect(bands.lowerH).toBeGreaterThanOrEqual(36);
  });

  it("compiles a board with no safe/titleH/lowerH and wraps the title", () => {
    const result = compileSource(
      `artifact AutoBoard
state gene = "CD8A"
scene
  size: 280 220
  background: #ffffff
widget layout.board
  title: "Long hyphenated board-title wraps without author insets"
  subtitle: "compiler owns the lower-third"
  caption: "source: virtual cohort"
  controls: [CD8A, IL6]
  bind: gene
  guides: false
`,
      "auto-board.viva",
      { handbookIds: ["print-nature"] },
    );
    expect(result.error).toBeNull();
    const ir = result.ir!;
    expect(ir.frames.map((f) => f.name)).toEqual(
      expect.arrayContaining(["safe", "title", "body", "lower", "hud"]),
    );
    const copy = ir.scene.layers.find((l) => l.name === "__board_copy")!;
    const titles = copy.items.filter((i) => i.kind === "node" && /^board_docTitle/.test(i.name));
    expect(titles.length).toBeGreaterThan(1);
    const titleFrame = ir.frames.find((f) => f.name === "title")!;
    const body = ir.frames.find((f) => f.name === "body")!;
    const env = [ir.state, ir.data];
    const titleY = evaluate(titleFrame.props.y, env) as number[];
    const bodyY = evaluate(body.props.y, env) as number[];
    expect(titleY[1]).toBeGreaterThan(titleY[0]! + 28);
    expect(bodyY[0]).toBe(titleY[1]);
    const first = titles[0];
    if (first?.kind === "node") {
      expect(String(evaluate(first.props.text, env))).toMatch(/Long|hyphenated|board/);
    }
  });
});
