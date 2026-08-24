import type { CompileMeta, HandbookId } from "./types.js";

/**
 * Resolve handbook ids for a single compile/patch call.
 * Handbooks are **on-demand**: nothing runs unless ids are provided explicitly
 * on this call, or inherited from session defaults when meta omits `handbooks`.
 */
export function resolveSessionHandbooks(
  meta: CompileMeta | undefined,
  sessionHandbooks: HandbookId[],
): HandbookId[] {
  if (meta !== undefined && "handbooks" in meta && meta.handbooks !== undefined) {
    return meta.handbooks;
  }
  return sessionHandbooks;
}

/** True when compile should run the style preset hook. */
export function shouldApplyHandbookHook(handbookIds: HandbookId[]): boolean {
  return handbookIds.length > 0;
}
