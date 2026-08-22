# Style handbooks (plugins)

Optional **single-shot manuals** for multi-turn LLM generation, plus **compile-time preset hooks** for deterministic publication quality.

Full hook architecture: [`HOOK.md`](./HOOK.md). Design rules: `docs/DESIGN.md` §7.

## How to use

1. Always load the core system prompt (`src/llm/system-prompt.ts`).
2. For a generation call, append **one** handbook (rarely more) by id.
3. Pass the **same ids** to `session.compile({ handbooks: [...] })` so the compiler applies the preset — not only the LLM.
4. Handbooks must **not** invent new syntax; they constrain defaults (palette, type, line weights, glow policy, margins).
5. Authors tag nodes with `role` / `colorBy` / `palette`; the hook fills paint props from `src/style/presets/<id>.json`.

## Available

| id | Prose | Preset | Intent |
| --- | --- | --- | --- |
| `print-nature` | `print-nature.md` | `src/style/presets/print-nature.json` | Publication / inline report figures |
| `dashboard` | `dashboard.md` | `src/style/presets/dashboard.json` | Ops / studio dashboards |
| `slides` | (planned prose) | `src/style/presets/slides.json` | Large-type presentation boards |

Add prose as `docs/handbooks/<id>.md` and preset as `src/style/presets/<id>.json`, then register in `src/style/registry.ts`.
