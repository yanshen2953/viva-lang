export type ExamCheck = { name: string; pass: boolean; detail?: string };

/** Pi has no built-in MCP; exam loads `install/pi-viva-mcp.ts` and allowlists these. */
export const EXAM_PI_MCP_TOOLS = [
  "viva_compile",
  "viva_check",
  "viva_session",
  "viva_prompt",
] as const;

export const EXAM_MCP_SYSTEM_ADDENDUM = `You have Viva MCP tools (stdio server via the Pi extension). Use them.

- After drafting source, call viva_compile once (visual:false). If success/ok is false, ir.data is empty, or hints mention data tables, fix and compile once more — then stop calling tools.
- Need syntax? viva_prompt with includeLanguage:true (do not ask it on every turn).
- Entities (circles, series, rows) must be data-backed: \`data NAME = [...]\`. State alone is not a table. Nodes that collide need solid: true.
- viva_session can create/compile/patch a headless session if you need world/provenance.
- When finished, output ONLY the full Viva source starting with the word artifact. No bash, no repo edits.`;

function stripTrailingProse(src: string): string {
  const m = /^(artifact[\s\S]*?)(?:\n{2,}(?:Note|Explanation|Here|I |The |Hope)|$)/i.exec(
    src,
  );
  return (m?.[1] ?? src).trim();
}

export function extractVivaSource(text: string): string {
  const candidates: string[] = [];
  for (const m of text.matchAll(/```(?:viva)?\s*\n([\s\S]*?)```/gi)) {
    const body = m[1]!.trim();
    const idx = body.search(/^artifact\b/m);
    if (idx >= 0) candidates.push(stripTrailingProse(body.slice(idx)));
  }
  for (const part of text.split(/(?=^artifact\b)/m)) {
    if (!/^artifact\b/m.test(part.trim())) continue;
    candidates.push(stripTrailingProse(part.trim()));
  }
  if (candidates.length) return candidates[candidates.length - 1]!;
  return text.trim();
}

export function shouldRepair(checks: ExamCheck[]): boolean {
  return checks.some((c) => !c.pass);
}

export function formatFailedChecks(checks: ExamCheck[]): string {
  return checks
    .filter((c) => !c.pass)
    .map((c) => `- ${c.name}: ${c.detail ?? "fail"}`)
    .join("\n");
}

export function redactSecrets(text: string, secrets: Array<string | undefined>): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 8) out = out.split(secret).join("[REDACTED]");
  }
  return out;
}
