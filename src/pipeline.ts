import { compile, type CompileOptions } from "./compiler.js";
import type { CheckOptions } from "./check/types.js";
import { runBrowserVisual } from "./check/browser-visual.js";
import { runStructuralChecks } from "./check/structural.js";
import { VivaError, withSyntaxHint, type Diagnostic } from "./diagnostics.js";
import type { VisualIR } from "./ir.js";
import { parse } from "./parser.js";

export type { CompileOptions };

export type PipelineCheckOptions = CheckOptions;

export type PipelineCompileOptions = CompileOptions & {
  /** Layout / raster QA after successful compile. */
  check?: PipelineCheckOptions;
};

export type CompileResult = {
  ir: VisualIR | null;
  error: string | null;
  diagnostics: Diagnostic[];
  /** Layout / visual QA (when check options enabled). */
  checkDiagnostics?: import("./check/types.js").CheckDiagnostic[];
  checkOk?: boolean;
  /** IR exists and no check/visual errors. */
  success?: boolean;
};

export function compileSource(
  source: string,
  filename = "<input>",
  options?: PipelineCompileOptions,
): CompileResult {
  try {
    const artifact = parse(source, filename);
    const hooked = options?.handbookIds?.length || options?.preset
      ? options
      : undefined;
    const ir = compile(artifact, hooked);
    const diagnostics: Diagnostic[] = [];
    let checkDiagnostics: import("./check/types.js").CheckDiagnostic[] | undefined;
    let checkOk: boolean | undefined;

    if (options?.check) {
      checkDiagnostics = [
        ...(options.check.structural !== false ? runStructuralChecks(ir, options.check) : []),
        ...runBrowserVisual(ir),
      ];
      checkOk = !checkDiagnostics.some((d) => d.severity === "error");
      for (const d of checkDiagnostics) {
        diagnostics.push(d);
      }
    }

    return {
      ir,
      error: null,
      diagnostics,
      checkDiagnostics,
      checkOk,
      success: checkOk !== false,
    };
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
      return { ir: null, error: errorText || error.message, diagnostics, success: false };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      ir: null,
      error: message,
      diagnostics: [{ message, span: { line: 1, column: 1 }, source: filename }],
      success: false,
    };
  }
}
