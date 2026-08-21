import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../src/compiler";
import { evaluate } from "../src/eval";
import { parse } from "../src/parser";
import { compileSource } from "../src/pipeline";

const examplesDir = path.resolve("examples");

describe("parser and compiler", () => {
  it("parses a hello artifact", () => {
    const artifact = parse(
      `artifact "Hello"

state count = 0

scene
  size: 880 480
  layer main
    node counter
      x: 40
      y: 40
      text: count

event click on counter
  count = count + 1
`,
      "hello.viva",
    );

    expect(artifact.name).toBe("Hello");
    expect(artifact.states[0]?.name).toBe("count");
    expect(artifact.events).toHaveLength(1);
    expect(artifact.scene?.layers[0]?.items[0]?.kind).toBe("node");
  });

  it("evaluates arithmetic and logic", () => {
    const artifact = parse(`artifact Demo
state x = 2 + 3 * 4
state ok = x > 10 and true
`);
    const ir = compile(artifact);
    expect(ir.state.x).toBe(14);
    expect(ir.state.ok).toBe(true);
  });

  it("compiles every bundled example", () => {
    const files = [
      "hello.viva",
      "cities.viva",
      "cells.viva",
      "paper.viva",
      "twin.viva",
      "dashboard.viva",
      "arena.viva",
    ];
    for (const file of files) {
      const source = readFileSync(path.join(examplesDir, file), "utf8");
      const result = compileSource(source, file);
      expect(result.error, result.error ?? file).toBeNull();
      expect(result.ir?.name).toBeTruthy();
    }
  });

  it("looks up nested fields", () => {
    const value = evaluate(
      parse(`artifact T
state selected = { name: "Beijing", pop: 21 }
`).states[0]!.value,
      [{}],
    );
    expect(value).toEqual({ name: "Beijing", pop: 21 });
  });
});
