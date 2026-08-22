# AGENTS.md

## Cursor Cloud specific instructions

Dependency refresh on pod start is `npm install` (see environment update script).

### Commands

| Action | Command |
| --- | --- |
| Tests | `npm test` (deterministic corpus/exam — no LLM) |
| Exam subset | `npm run test:exam` |
| **Agent exam (Pi = SUT)** | `export DEEPSEEK_API_KEY=…` then `npm run test:agent-exam` |
| Dev playground | `npm run dev` (Vite `:5173`) |
| CLI without dist | `npx vite-node src/cli.ts -- compile examples/hello.viva` |
| Agent Host smoke | `npx vite-node scripts/hello-agent.ts` |
| Exam UI scene runner | `npm run dev` then `node scripts/exam-layers-ui.mjs` |

`npm run build` may still fail on unrelated `tsc` strictness in playground/runtime; prefer `vite-node` + `vitest` for day-to-day.

### Two test tracks

1. **Deterministic** (`tests/corpus`, `tests/exam`, `examples/exam`) — layers L1–L6, events E1–E5, space/charts, negatives, Host policies. See `docs/TESTING.md`.
2. **Agent exam** (`tests/agent-exam` A01–A12, `scripts/run-agent-exam.ts`) — **Pi + DeepSeek** is the agent under test; `VivaAgentHost` grades. Default model `deepseek-v4-flash-vision-exp`. Never commit API keys.

### Architecture notes for agents

- **Language core:** `src/{parser,compiler,runtime,widgets,space}.ts`
- **Agent surface (dogfood):** `src/agent/` — `createVivaAgentHost`, Session `compile`/`patch`, PipelinePort, DomainView registry, ProvenanceWriter
- **Playground** must go through `VivaAgentHost` (not raw `new Runtime`)
- **Space:** `frame` + node `frame:` maps data-domain x/y via linear scales (`src/space.ts`)
- **Charts:** `widget chart.scatter|line|bar`
- Design/plan: `docs/DESIGN.md`, `docs/PLAN.md`, host sketch `docs/hosts/minimal-host.md`

### No secrets / services

Core flows need no secrets. **Agent exam** needs `DEEPSEEK_API_KEY` in the environment only (gitignored `.env` OK). Deterministic Host unit tests use in-memory provenance / stub prompts.
