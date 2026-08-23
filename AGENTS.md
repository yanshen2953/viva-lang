# AGENTS.md

## Cursor Cloud specific instructions

Dependency refresh on pod start is `npm install` (see environment update script).

### Commands

| Action | Command |
| --- | --- |
| Tests | `npm test` (deterministic corpus/exam — no LLM) |
| Exam subset | `npm run test:exam` |
| **Agent exam hard (Pi = SUT)** | `export DEEPSEEK_API_KEY=…` then `npm run test:agent-exam` |
| Agent exam smoke | `npm run test:agent-exam:smoke` |
| Dev playground | `npm run dev` (Vite `:5173`) |
| CLI without dist | `npx vite-node src/cli.ts -- compile examples/hello.viva` |
| Agent Host smoke | `npx vite-node scripts/hello-agent.ts` |
| Export SVG/JPG/PDF | `npx vite-node src/cli.ts -- export examples/hello.viva -f pdf -o /tmp/h.pdf` |
| Layout checks | `npx vite-node src/cli.ts -- check examples/figure-atlas.viva --visual --handbook print-nature` |
| Multimodal check | `npx vite-node src/cli.ts -- check file.viva --vision` (see `viva.models.json.example`) |
| Model slots | `npx vite-node src/cli.ts -- models` |
| Prune artifact screenshots | `node scripts/cleanup-artifacts.mjs` |
| **One-click deploy** | `docker compose up -d --build` or `bash install/one-click.sh` |
| Agent HTTP API | `viva serve --host 0.0.0.0 --port 8765` — see `docs/DEPLOY.md` |
| MCP (Cursor) | `viva mcp` or `viva-mcp` — tools include `viva_session` / `viva_pipeline`; see `docs/hosts/mcp.md` |
| Provenance CLI | `npx vite-node src/cli.ts -- provenance examples/hello.viva` |
| Gap checklist | `docs/GAPS.md` — PLAN §1 victory conditions |
| **Handoff doc** | `docs/HANDOFF.md` — context for new Cloud Agents |
| Review brief demo | `npm run demo:review` |
| Agent HTTP bridge | `npx vite-node src/cli.ts -- serve --port 8765` |
| Exam UI scene runner | `npm run dev` then `node scripts/exam-layers-ui.mjs` |

`npm run build` may still fail on unrelated `tsc` strictness in playground/runtime; prefer `vite-node` + `vitest` for day-to-day.

### Two test tracks

1. **Deterministic** (`tests/corpus`, `tests/exam`, `examples/exam`) — layers L1–L6, events E1–E5, space/charts, negatives, Host policies. See `docs/TESTING.md`.
2. **Agent exam** (`tests/agent-exam`) — **Pi + DeepSeek** is the SUT. Default `npm run test:agent-exam` runs **hard** track H01–H08 (slim system, no template crib). Smoke A01–A12 via `test:agent-exam:smoke`. Model `deepseek-v4-flash-vision-exp`. Never commit API keys.

### Architecture notes for agents

- **Language core:** `src/{parser,compiler,runtime,widgets,space,eval,simulate}.ts`
- **Agent surface (dogfood):** `src/agent/` — `createVivaAgentHost`, Session `compile`/`patch`/`simulate`/`exportPackage`/`exportVectorPackage`/`createReview`, PipelinePort, DomainView registry, ProvenanceWriter
- **Review → agent repair:** `src/review/` + playground **审查模式** — rect/point/lasso/bezier, add/subtract/intersect/invert, rich feedback kinds → `agentBrief`. See `docs/hosts/review.md`
- **Vector export:** `export -f svg|pdf` is geometry-precise (`data-viva-id`); `pdf-raster` is PNG-in-PDF fallback
- **Layout QA:** structural in Playground + `viva check --visual`; multimodal `--vision` via `viva.models.json` / HTTP entry (`docs/CHECK.md`)
- **Playground** must go through `VivaAgentHost` (not raw `new Runtime`)
- **Space:** `frame` + node `frame:` maps data-domain x/y via linear scales (`src/space.ts`)
- **Charts / layout:** `widget chart.scatter|line|bar|heatmap`；`widget layout.figure` + `panel: a`。动态插件：`registerWidget()` / `viva widgets`。愿景对照：`docs/VISION.md`
- Design/plan: `docs/DESIGN.md`, `docs/PLAN.md`, host docs `docs/hosts/README.md`

### No secrets / services

Core flows need no secrets. **Agent exam** needs `DEEPSEEK_API_KEY` in the environment only (gitignored `.env` OK). Deterministic Host unit tests use in-memory provenance / stub prompts.
