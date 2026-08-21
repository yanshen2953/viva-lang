export type Span = {
  line: number;
  column: number;
};

export type Diagnostic = {
  message: string;
  span: Span;
  source?: string;
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
  return `${where}${d.span.line}:${d.span.column}: ${d.message}`;
}
