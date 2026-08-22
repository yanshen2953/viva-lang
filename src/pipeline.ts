import { compile, type CompileOptions } from "./compiler.js";
import { VivaError, withSyntaxHint, type Diagnostic } from "./diagnostics.js";
import type { VisualIR } from "./ir.js";
import { parse } from "./parser.js";

export type { CompileOptions };

export type CompileResult = {
  ir: VisualIR | null;
  error: string | null;
  diagnostics: Diagnostic[];
};

export function compileSource(
  source: string,
  filename = "<input>",
  options?: CompileOptions,
): CompileResult {
  try {
    const artifact = parse(source, filename);
    const hooked = options?.handbookIds?.length || options?.preset
      ? options
      : undefined;
    const ir = compile(artifact, hooked);
    return { ir, error: null, diagnostics: [] };
  } catch (error) {
    if (error instanceof VivaError) {
      const diagnostics = error.diagnostics.map((d) => {
        if (d.hint) return d;
        const enriched = withSyntaxHint(d.message, source.slice(0, 240));
        return { ...d, code: enriched.code ?? d.code, hint: enriched.hint ?? d.hint };
      });
      const errorText = diagnostics
        .map((d) => {
          const where = d.source ? `${d.source}:` : "";
          const base = `${where}${d.span.line}:${d.span.column}: ${d.message}`;
          return d.hint ? `${base} (${d.hint})` : base;
        })
        .join("\n");
      return { ir: null, error: errorText || error.message, diagnostics };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      ir: null,
      error: message,
      diagnostics: [{ message, span: { line: 1, column: 1 }, source: filename }],
    };
  }
}
