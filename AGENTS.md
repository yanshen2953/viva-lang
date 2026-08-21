# AGENTS.md

## Cursor Cloud specific instructions

Dependency refresh on pod start is `npm install` (see environment update script).

### Commands

| Action | Command |
| --- | --- |
| Tests | `npm test` |
| Dev playground | `npm run dev` (Vite `:5173`) |
| CLI without dist | `npx vite-node src/cli.ts -- compile examples/hello.viva` |
| Agent smoke | `npx vite-node scripts/hello-agent.ts` |

`npm run build` may still fail on unrelated `tsc` strictness in playground/runtime; prefer `vite-node` + `vitest` for day-to-day.

### Architecture notes for agents

- **Language core:** `src/{parser,compiler,runtime,widgets,space}.ts`
- **Agent surface (dogfood):** `src/agent/` — `createVivaAgentHost`, Session `compile`/`patch`, PipelinePort, DomainView registry, ProvenanceWriter
- **Playground** must go through `VivaAgentHost` (not raw `new Runtime`)
- **Space:** `frame` + node `frame:` maps data-domain x/y via linear scales (`src/space.ts`)
- **Charts:** `widget chart.scatter|line|bar`
- Design/plan: `docs/DESIGN.md`, `docs/PLAN.md`, host sketch `docs/hosts/minimal-host.md`

### No secrets / services

Pure client library + Vite playground. No DB, Docker compose, or API keys required for core flows.
