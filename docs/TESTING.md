# Testing

Two tracks:

| Track | Runner | Purpose |
| --- | --- | --- |
| **Deterministic** | `npm test` | Corpus / IR / layers / Host API (no LLM) |
| **Agent exam** | Pi + DeepSeek as **SUT** | NL→Viva / repair / patch; graded by `VivaAgentHost` |

## Deterministic

```bash
npm test
# or
npm run test:exam
```

Coverage (see `tests/corpus/README.md`):

- Layers L1–L6 (z-order, opacity, visible, blend, blur/glow, nested for/if)
- Events E1–E5 (click, drag, tick/rule, key, collide)
- Space/charts S1, C1–C3, path G1, bind W1, timeline T1
- Negative N1 (`resource` must fail)
- Host session policies (`reset` / `preserve` / `preserve-data`)

## Agent exam (Pi = system under test)

Pi is **not** the author of the suite — it is the agent under test.

```bash
export PATH="$HOME/.npm-global/bin:$PATH"
export DEEPSEEK_API_KEY=...   # never commit

npm run test:agent-exam
# npx vite-node scripts/run-agent-exam.ts --only A09
```

Default model: `deepseek-v4-flash-vision-exp`.

Scenarios A01–A12: generate frame/layers/charts/drag/timeline/counter, repair broken + nested-frame mistakes, patch opacity + magic→frame, handbook inject.

Report: `/opt/cursor/artifacts/agent-exam/report.json`

Details: [`tests/agent-exam/README.md`](../tests/agent-exam/README.md).

## Rules

- Do not use Pi to invent corpus fixtures as a substitute for deterministic tests.
- Do not commit `.env` / API keys.
- Pixel goldens optional later; structure + compile first.
