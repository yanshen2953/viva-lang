# Agent exam (Pi = system under test)

Coding agent under test: **Pi** + DeepSeek (`deepseek-v4-flash-vision-exp`).
Grader: **`VivaAgentHost`** (compile / patch / provenance).

Deterministic corpus lives under `tests/corpus/` — no LLM there.

## Setup

```bash
npm config set prefix ~/.npm-global
export PATH="$HOME/.npm-global/bin:$PATH"
npm install -g --ignore-scripts @mariozechner/pi-coding-agent
# ~/.pi/agent/models.json → deepseek provider, apiKey: $DEEPSEEK_API_KEY

export DEEPSEEK_API_KEY=...   # gitignored .env OK; never commit
```

## Run

```bash
npm run test:agent-exam
npx vite-node scripts/run-agent-exam.ts --only A02
npx vite-node scripts/run-agent-exam.ts --model deepseek-v4-flash-vision-exp
```

Artifacts: `/opt/cursor/artifacts/agent-exam/`.

## Scenario catalog

| ID | Kind | Intent |
| --- | --- | --- |
| A01 | generate | frame-scaled scatter |
| A02 | generate | layer z-order bottom/top |
| A03 | repair | broken arithmetic assign |
| A04 | patch | add top-layer opacity |
| A05 | generate | print-nature handbook; top-level frame |
| A06 | generate | `widget chart.line` |
| A07 | generate | drag writeback |
| A08 | generate | timeline scrub |
| A09 | repair | frame wrongly nested in scene |
| A10 | generate | click counter |
| A11 | generate | `widget chart.scatter` |
| A12 | patch | magic-number coords → frame |

Failed compile → one automatic Pi repair turn → re-grade.
