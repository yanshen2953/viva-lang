import { describe, expect, it } from "vitest";
import { compileSource } from "../../src/pipeline";
import { withSyntaxHint } from "../../src/diagnostics";

describe("syntax diagnostics + hints", () => {
  it("hints when artifact name is missing newline case", () => {
    const r = compileSource(`artifact\ndata x = 1\n`, "bad.viva");
    expect(r.ir).toBeNull();
    expect(r.error).toMatch(/artifact/i);
    expect(r.diagnostics[0]?.hint || r.error).toBeTruthy();
  });

  it("hints event missing on", () => {
    const r = compileSource(
      `artifact E
scene
  layer a
    node n
      x: 1
      y: 1
event click
  x = 1
`,
      "e.viva",
    );
    expect(r.ir).toBeNull();
    expect(r.error).toMatch(/on/);
    expect(r.diagnostics.some((d) => d.code === "event-on" || d.hint?.includes("event"))).toBe(
      true,
    );
  });

  it("withSyntaxHint classifies yaml-ish mistakes", () => {
    const h = withSyntaxHint("expected IDENT or KEYWORD, got ':'", "state:");
    expect(h.code).toBe("no-yaml");
  });
});
