export type Span = {
  line: number;
  column: number;
};

export type Diagnostic = {
  message: string;
  span: Span;
  source?: string;
  /** Stable machine code for tests / repair agents */
  code?: string;
  /** Human/LLM repair hint */
  hint?: string;
};

export class VivaError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(diagnostics: Diagnostic[]) {
    super(diagnostics.map((d) => formatDiagnostic(d)).join("\n"));
    this.name = "VivaError";
    this.diagnostics = diagnostics;
  }
}

export function formatDiagnostic(d: Diagnostic): string {
  const where = d.source ? `${d.source}:` : "";
  const base = `${where}${d.span.line}:${d.span.column}: ${d.message}`;
  if (d.hint) return `${base} (${d.hint})`;
  return base;
}

/** Attach repair hints for common LLM syntax mistakes. */
export function withSyntaxHint(message: string, near?: string): { message: string; code?: string; hint?: string } {
  const m = message.toLowerCase();
  const nearL = (near ?? "").toLowerCase();
  if (m.includes("expected string or ident") && m.includes("newline")) {
    return {
      message,
      code: "artifact-name",
      hint: 'Write `artifact "Name"` on one line (name required).',
    };
  }
  if (m.includes("got '{'") || nearL.includes("artifact {")) {
    return {
      message,
      code: "no-braces",
      hint: "Viva is indentation-based, not `artifact { ... }` / YAML maps.",
    };
  }
  if (m.includes("expected colon") && nearL.includes("plot")) {
    return {
      message,
      code: "frame-toplevel",
      hint: "Declare `frame plot` at column 0 (sibling of scene); nodes use property `frame: plot`.",
    };
  }
  if (m.includes("expected 'on'") || (m.includes("event") && m.includes("newline"))) {
    return {
      message,
      code: "event-on",
      hint: "Events need `event <type> on <target>` then an indented body.",
    };
  }
  if (nearL.includes("widget:") || (m.includes("indent") && nearL.includes("widget"))) {
    return {
      message,
      code: "widget-toplevel",
      hint: "Use top-level `widget chart.line` (not `widget: chart.line` under scene).",
    };
  }
  if (m.includes("got ':'") && (nearL.includes("state") || nearL.includes("data") || nearL.includes("scene"))) {
    return {
      message,
      code: "no-yaml",
      hint: "Use `state n = 0` / `data rows = [...]`, not `state:` / `data:` YAML.",
    };
  }
  return { message };
}
