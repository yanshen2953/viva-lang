# AGENTS.md

## Cursor Cloud specific instructions

Dependency refresh on pod start is `npm install` (see environment update script).

### Commands

| Action | Command |
| --- | --- |
| Tests | `npm test` (vitest; deterministic — no LLM) |
| Dev playground | `npm run dev` (Vite `:5173`) |
| CLI without dist | `npx vite-node src/cli.ts -- compile examples/hello.viva` |
| Agent Host smoke | `npx vite-node scripts/hello-agent.ts` |
| Exam tests | `npx vitest run tests/exam` |
| Exam snapshot update | `npx vitest run tests/exam/snapshot.test.ts -u` |
| Exam UI scene runner | `npm run dev &` then `node scripts/exam-layers-ui.mjs` (needs Chrome via `puppeteer-core`) |
| **Agent exam (Pi = SUT)** | `export DEEPSEEK_API_KEY=…` then `npx vite-node scripts/run-agent-exam.ts` |

`npm run build` may still fail on unrelated `tsc` strictness in playground/runtime; prefer `vite-node` + `vitest` for day-to-day.

### Two test tracks

1. **Deterministic** (`tests/corpus`, `tests/exam`, `examples/exam`) — IR/layer contracts, no network. Backs `docs/TESTING.md`.
2. **Agent exam** (`tests/agent-exam`, `scripts/run-agent-exam.ts`) — **Pi + DeepSeek** is the agent under test; `VivaAgentHost` grades compile/patch/provenance. Default model `deepseek-v4-flash-vision-exp`. Never commit API keys (read from env / gitignored `.env`).

### Architecture notes for agents

- **Language core:** `src/{parser,compiler,runtime,widgets,space}.ts`
- **Agent surface (dogfood):** `src/agent/` — `createVivaAgentHost`, Session `compile`/`patch`, PipelinePort, DomainView registry, ProvenanceWriter
- **Playground** must go through `VivaAgentHost` (not raw `new Runtime`)
- **Space:** `frame` + node `frame:` maps data-domain x/y via linear scales (`src/space.ts`)
- **Charts:** `widget chart.scatter|line|bar`
- Design/plan: `docs/DESIGN.md`, `docs/PLAN.md`, host sketch `docs/hosts/minimal-host.md`

### Exam problem set

`examples/exam/` + `tests/corpus/*.expect.json` + `tests/exam/` form the systematic
layer test corpus (z-order, opacity, visible, blend, blur/glow, frame scales,
chart expansion). Strategy and runbook live in `docs/TESTING.md`. The node
tests assert compile IR + paint/DOM structure via a mini in-memory DOM
(`tests/exam/dom.ts`); the puppeteer scene runner (`scripts/exam-layers-ui.mjs`)
checks real browser DOM z-order + hit-testing.

### No secrets / services

Core flows need no secrets. **Agent exam** reads `DEEPSEEK_API_KEY` from the
environment only — never commit keys (the value lives in gitignored `.env`).
Deterministic Host unit tests use in-memory provenance / stub prompts, no API key.
