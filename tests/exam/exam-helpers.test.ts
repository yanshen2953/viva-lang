import { describe, expect, it } from "vitest";
import {
  extractVivaSource,
  formatFailedChecks,
  redactSecrets,
  shouldRepair,
} from "../../src/agent/exam-helpers.js";

describe("agent exam helpers", () => {
  it("extracts the last artifact after tool chatter", () => {
    const raw = `
tool viva_compile → { "success": true }
Here is a draft.

\`\`\`viva
artifact "Draft"
state x = 1
scene
  layer a
    node t
      x: 1
      y: 1
\`\`\`

Final:

artifact "Arena"
data balls = [{ x: 1, y: 2 }]
scene
  layer play
    node a
      x: 10
`;
    const src = extractVivaSource(raw);
    expect(src.startsWith("artifact")).toBe(true);
    expect(src).toContain("data balls");
    expect(src).toContain('artifact "Arena"');
    expect(src).not.toContain('artifact "Draft"');
  });

  it("repairs any failed check, not only compile", () => {
    expect(shouldRepair([{ name: "compiles", pass: true }])).toBe(false);
    expect(
      shouldRepair([
        { name: "compiles", pass: true },
        { name: "ir.minDataKeys", pass: false, detail: "dataKeys=0" },
      ]),
    ).toBe(true);
    expect(
      formatFailedChecks([
        { name: "compiles", pass: true },
        { name: "ir.minDataKeys", pass: false, detail: "dataKeys=0" },
      ]),
    ).toBe("- ir.minDataKeys: dataKeys=0");
  });

  it("redacts secrets from exam logs", () => {
    expect(redactSecrets("key=sk-abc12345-rest", ["sk-abc12345-rest"])).toBe(
      "key=[REDACTED]",
    );
  });
});
