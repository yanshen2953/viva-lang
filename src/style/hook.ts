import type { Artifact } from "../ast.js";
import { applyStyleToArtifact } from "./apply.js";
import { enforceStylePolicies } from "./enforce.js";
import { lintStyle } from "./lint.js";
import { resolveStylePresets } from "./registry.js";
import type { HandbookHookOptions, HandbookHookResult, StyleMeta } from "./types.js";

export type StyleHookArtifactResult = {
  artifact: Artifact;
} & HandbookHookResult;

/**
 * Compile-time handbook hook: applies machine-readable presets to **any** Viva scene.
 * Works on LLM-authored nodes (role / colorBy / palette), not on a fixed chart catalog.
 */
export function applyHandbookHook(
  artifact: Artifact,
  options: HandbookHookOptions = {},
): StyleHookArtifactResult {
  const handbookIds = options.handbookIds ?? [];
  const preset =
    options.preset ??
    (handbookIds.length ? resolveStylePresets(handbookIds) : null);

  if (!preset) {
    return {
      artifact,
      meta: { handbookIds: [], preset: { id: "none" } },
      diagnostics: [],
    };
  }

  let next = structuredClone(artifact) as Artifact;
  next = applyStyleToArtifact(next, preset);
  if (options.enforce !== false) {
    next = enforceStylePolicies(next, preset);
  }

  const diagnostics =
    options.lint === false ? [] : lintStyle(next, preset).map((d) => ({
      ...d,
      hint: d.hint ?? "style handbook lint (warning)",
    }));

  const meta: StyleMeta = { handbookIds, preset };
  return { artifact: next, meta, diagnostics };
}

export function handbooksToPresetIds(handbookIds: string[]): string[] {
  return handbookIds;
}
