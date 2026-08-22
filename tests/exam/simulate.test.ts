import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { compileSource } from "../../src/pipeline";
import { simulate } from "../../src/simulate";
import { createVivaAgentHost } from "../../src/agent";

describe("headless simulate (behavior)", () => {
  it("runs tick bodies and grows a series (P1 param lab)", () => {
    const src = readFileSync(path.resolve("examples/exam/P1_param_lab.viva"), "utf8");
    const { ir, error } = compileSource(src, "P1.viva");
    expect(error).toBeNull();
    const world = simulate(ir!, { ticks: 5 });
    expect(world.state.t).toBe(5);
    expect(Array.isArray(world.data.series)).toBe(true);
    expect((world.data.series as unknown[]).length).toBeGreaterThan(1);
  });

  it("fires click events into state", () => {
    const src = `artifact C
state count = 0
scene
  layer ui
    node btn
      x: 10
      y: 10
      text: count
event click on btn
  count = count + 1
`;
    const { ir, error } = compileSource(src, "c.viva");
    expect(error).toBeNull();
    const world = simulate(ir!, {
      events: [{ type: "click", target: "btn" }, { type: "click", target: "btn" }],
    });
    expect(world.state.count).toBe(2);
  });

  it("session.simulate updates world with mount null", () => {
    const host = createVivaAgentHost();
    const session = host.createSession({ mount: null });
    const src = readFileSync(path.resolve("examples/exam/P1_param_lab.viva"), "utf8");
    expect(session.compile(src).ok).toBe(true);
    const before = session.getWorld() as { state: { t: number } };
    expect(before.state.t).toBe(0);
    session.simulate({ ticks: 3 });
    const after = session.getWorld() as { state: { t: number }; data: { series: unknown[] } };
    expect(after.state.t).toBe(3);
    expect(after.data.series.length).toBeGreaterThan(1);
  });
});
