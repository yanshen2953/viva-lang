# Style handbooks (plugins)

These are **optional, single-shot manuals** for multi-turn LLM generation.
They are not part of the Viva language core.

## How to use

1. Always load the core system prompt (`src/llm/system-prompt.ts`).
2. For a given generation call, optionally append **one** handbook (or a small set) that matches the target medium.
3. Do not permanently merge handbook rules into the core prompt.
4. Handbooks must not invent new syntax; they only constrain defaults (palette, type scale, line weights, whether glow is allowed, figure margins, export size).

## Planned handbooks

| id | Intent |
| --- | --- |
| `print-nature` | Restrained print figures: no glow, thin strokes, colorblind-safe ramps, panel labels |
| `dashboard` | Product/ops UI: stronger fills, glow allowed, larger hit targets |
| `slides` | Large type, fewer layers, high contrast |

Add new files as `docs/handbooks/<id>.md` and inject by id at call time.
