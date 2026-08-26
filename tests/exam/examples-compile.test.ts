import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileSource } from "../../src/pipeline.js";

function vivaFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".viva"))
    .map((f) => path.join(dir, f))
    .sort();
}

describe("example and agent-exam seed compile", () => {
  it("compiles every top-level examples/*.viva", () => {
    const files = vivaFiles("examples");
    expect(files.length).toBeGreaterThan(10);
    const failures: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const result = compileSource(src, path.basename(file), {
        handbookIds: ["print-nature"],
      });
      if (result.error || !result.ir) {
        failures.push(`${file}: ${result.error ?? "no ir"}`);
      }
    }
    expect(failures).toEqual([]);
  }, 60_000);

  it("compiles every examples/exam/*.viva seed (offline agent-exam rate)", () => {
    const files = vivaFiles("examples/exam");
    expect(files.length).toBe(20);
    const broken = /N1_resource_error|broken|multibug/i;
    const unexpected: string[] = [];
    let ok = 0;
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const result = compileSource(src, path.basename(file), {
        handbookIds: ["print-nature"],
      });
      const compiled = Boolean(result.ir) && !result.error;
      if (broken.test(file)) {
        if (compiled) unexpected.push(`${file}: expected compile failure`);
      } else if (!compiled) {
        unexpected.push(`${file}: ${result.error ?? "no ir"}`);
      } else {
        ok += 1;
      }
    }
    expect(unexpected).toEqual([]);
    expect(ok).toBe(files.filter((f) => !broken.test(f)).length);
  });

  it("compiles clean agent-exam seeds and keeps broken seeds failing", () => {
    const files = vivaFiles("tests/agent-exam/seeds");
    expect(files.length).toBeGreaterThan(0);
    const broken = /broken|multibug|nested/i;
    const unexpected: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const result = compileSource(src, path.basename(file));
      const ok = Boolean(result.ir) && !result.error;
      if (broken.test(file)) {
        if (ok) unexpected.push(`${file}: expected compile failure`);
      } else if (!ok) {
        unexpected.push(`${file}: ${result.error ?? "no ir"}`);
      }
    }
    expect(unexpected).toEqual([]);
  });
});
