# Style handbook hook (compile-time)

Handbooks are **two-layer plugins**. The language stays complete — the LLM can author **any** scene with `node` / `layer` / `frame` / `event`. The compiler does **not** need a catalog of chart types. Instead, handbooks attach **publication contracts** to whatever graph the model writes.

## Two layers

| Layer | What | When |
| --- | --- | --- |
| **Prose handbook** | `docs/handbooks/<id>.md` — composition rules for the LLM | Prompt injection |
| **Preset hook** | `src/style/presets/<id>.json` — tokens, roles, policies | **Compile + runtime** |

Same id (`print-nature`, `dashboard`, `slides`). Host passes `handbooks: ["print-nature"]` on `session.compile()` / `exportArtifact()`.

```
LLM writes arbitrary Viva (nodes, layers, for-loops, widgets as macros)
        ↓
expandWidgets()          # optional structure macros — not style
        ↓
applyHandbookHook()      # role defaults, palette(), policy enforce
        ↓
Visual IR + meta.style
        ↓
Runtime / export         # palette() builtins, skip meta props
```

## Authoring contract (no new keywords)

Authors (human or LLM) tag **semantic roles** on nodes. Paint details are optional overrides.

| Prop | Purpose |
| --- | --- |
| `role` | `panel` `plot` `axis` `grid` `title` `mark` `legend` … |
| `colorBy` | Field on `for` item for categorical color (`grp`, `series`, …) |
| `palette` | `categorical` `sequential` `accent` (default `categorical`) |
| `styleSkip` | `true` — opt out of hook for this node |

**Inference:** if `role` is omitted, the hook guesses from node name (`*Title` → title, `*Axis` → axis, `grid` → grid, small `w×h` rect → legend, etc.).

**Palette:** inside `for p in data`, a mark with `colorBy: grp` becomes `fill: palette(p.grp, "categorical")` at compile time — stable series→color mapping from the preset.

**Policies:** `print-nature` strips `glow` / `blur` / forbidden `blend` modes at compile time; `dashboard` allows restrained glow.

## Widgets are structure, handbooks are paint

`chart.*` widgets expand to nodes with `role: plot|axis|grid|mark` and `group:` → `colorBy`. They are **not** a closed chart catalog — they are optional macros. The same hook styles hand-drawn axes and LLM-composed custom figures.

## Host API

```ts
session.compile(source, { handbooks: ["print-nature"] });

import { resolveStylePresets, applyHandbookHook } from "viva-lang";
const preset = resolveStylePresets(["dashboard"]);
```

```bash
viva export fig.viva -f pdf --handbook print-nature
```

## Adding a handbook

1. `docs/handbooks/my-style.md` — LLM guidance (no new syntax).
2. `src/style/presets/my-style.json` — machine preset; `registerStylePreset()` or ship in `presets/`.
3. List in `docs/handbooks/README.md`.

See `docs/DESIGN.md` §7 for design rationale.
