# Testing

Two tracks:

| Track | Runner | Purpose |
| --- | --- | --- |
| **Deterministic** | `npm test` | Corpus / IR / layers / Host API (no LLM) |
| **Agent exam** | Pi + DeepSeek as **SUT** | NL→Viva / repair / patch; graded by `VivaAgentHost` |

## Four gates (arrival exam)

`tests/exam/four-gates.test.ts` is how we know we have **not** arrived.

The bar (user): one small source through **eyes / hand / export / agent**.
A green `npm test` is the measurable **floor**, not print / film / live-agent arrival.

| Door | Floor this file locks | Still not arrival |
| --- | --- | --- |
| Eyes | paper-column 89 mm + paper-cjk 89 mm + paper-storyboard 183 mm; SVG viewBox and vector PDF page the same size; CJK PDF `missingGlyphs` empty | Atlas is still 1360 px; “spacing like print” is unmeasured; no screen/PDF pair visual |
| Hand | those sources stay live; paper-cjk brush `__sel`; storyboard beat jump keeps `__sel`; play veils ignore pointer | Headless `simulate`, not one Runtime pointer session; page-jump lives on `paper-pages`, not the four named files |
| Export | `data-viva-id` = flatten = Runtime id scheme; storyboard `--beats` length = Clock holds, not `__beat++` in tick | gif/mp4 is a slideshow |
| Agent | MCP `viva_compile` + default slim prompt (not LANGUAGE.md); deterministic `repairSource` | No short-intent LLM → playable card |

```bash
npx vitest run tests/exam/four-gates.test.ts
```

## Deterministic

```bash
npm test
# or
npm run test:exam
```

Coverage (see `tests/corpus/README.md`):

- Layers L1–L6 (z-order, opacity, visible, blend, blur/glow, nested for/if)
- Events E1–E5 (click, drag, tick/rule, key, collide)
- Space/charts S1, C1–C3, path G1, bind W1, timeline T1, param lab P1
- Negative N1 (`resource` must fail)
- Host session policies (`reset` / `preserve` / `preserve-data`) + `exportPackage` + headless `simulate`
- Safe math / array concat / diagnostics hints
- Vector export (`tests/exam/export.test.ts`, `tests/exam/review-vector.test.ts`): `data-viva-id` parity, vector PDF vs `pdf-raster`
- Review geometry combine modes (`tests/exam/review-vector.test.ts`)

## Agent exam (Pi = system under test)

Pi is **not** the author of the suite — it is the agent under test.

```bash
export PATH="$HOME/.npm-global/bin:$PATH"
export DEEPSEEK_API_KEY=...   # never commit

npm run test:agent-exam          # hard track (default) — Cursor/Codex-aligned
npm run test:agent-exam:smoke    # A01–A12 language smoke
npm run test:agent-exam:all
```

Default model: `deepseek-v4-flash-vision-exp`.

| Track | Cases | Notes |
| --- | --- | --- |
| **hard** | H01–H08 | slim system + `docs/LANGUAGE.md` (no toy template), no syntax crib, multipanel / multiturn / blind repair / surgical patch |
| **smoke** | A01–A12 | full system + repair crib; regression floor |

Report: `/opt/cursor/artifacts/agent-exam/report-hard.json` (hard) or `report.json`.

Details: [`tests/agent-exam/README.md`](../tests/agent-exam/README.md).

## Rules

- Do not use Pi to invent corpus fixtures as a substitute for deterministic tests.
- Do not commit `.env` / API keys.
- Pixel goldens optional later; structure + compile first.
