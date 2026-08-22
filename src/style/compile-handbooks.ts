#!/usr/bin/env node
/** Resolve handbook ids for compile/export — only when explicitly requested. */
export function resolveCompileHandbooks(argv: string[]): string[] {
  return flagValues(argv, "--handbook");
}

function flagValues(argv: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name && argv[i + 1]) out.push(argv[++i]!);
  }
  return out;
}
