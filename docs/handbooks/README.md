# Style handbooks (plugins)

Optional **single-shot manuals** for multi-turn LLM generation.
Not part of the Viva language core. Full rules: `docs/DESIGN.md` §7.

## How to use

1. Always load the core system prompt (`src/llm/system-prompt.ts`).
2. For a given generation call, optionally append **one** handbook (rarely more) by id.
3. Do not permanently merge handbook rules into the core prompt.
4. Handbooks must **not** invent new syntax; they only constrain defaults (palette, type, line weights, glow policy, margins, export size).
5. Handbooks do **not** auto-carry across turns unless the host explicitly re-injects them.

## Available

| id | File | Intent |
| --- | --- | --- |
| `print-nature` | `print-nature.md` | Restrained print figures |
| `dashboard` | `dashboard.md` | Product/ops UI |
| `slides` | (planned) | Large type, few layers |

Add new files as `docs/handbooks/<id>.md` and inject by id at call time.
