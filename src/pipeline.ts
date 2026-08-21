import { compile } from "./compiler.js";
import { VivaError } from "./diagnostics.js";
import type { VisualIR } from "./ir.js";
import { parse } from "./parser.js";

export type CompileResult = {
  ir: VisualIR | null;
  error: string | null;
};

export function compileSource(source: string, filename = "<input>"): CompileResult {
  try {
    const artifact = parse(source, filename);
    return { ir: compile(artifact), error: null };
  } catch (error) {
    if (error instanceof VivaError) {
      return { ir: null, error: error.message };
    }
    return { ir: null, error: error instanceof Error ? error.message : String(error) };
  }
}
