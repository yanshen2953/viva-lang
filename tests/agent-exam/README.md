# Agent exam (Pi = system under test)

This track tests **agent↔Viva Host** integration. The coding agent is **Pi**,
wired to DeepSeek (`deepseek-v4-flash-vision-exp` by default). Viva's
`VivaAgentHost` is the **grader**, not the generator.

Deterministic corpus/unit exams (no LLM) live under `tests/corpus/` +
`tests/exam/` — those do **not** use Pi.

## Setup

```bash
# once
npm config set prefix ~/.npm-global
export PATH="$HOME/.npm-global/bin:$PATH"
npm install -g --ignore-scripts @mariozechner/pi-coding-agent
# models: ~/.pi/agent/models.json  (deepseek provider; apiKey: $DEEPSEEK_API_KEY)

export DEEPSEEK_API_KEY=...   # never commit; .env is gitignored
```

## Run

```bash
export PATH="$HOME/.npm-global/bin:$PATH"
export DEEPSEEK_API_KEY=...

# all agent scenarios
npx vite-node scripts/run-agent-exam.ts

# one case
npx vite-node scripts/run-agent-exam.ts --only A02

# model override
npx vite-node scripts/run-agent-exam.ts --model deepseek-v4-flash-vision-exp
```

Report + accepted sources: `/opt/cursor/artifacts/agent-exam/`.

## Scenario kinds

| kind | Meaning |
| --- | --- |
| `generate` | NL intent → Viva source (Pi, no tools) → Host.compile |
| `repair` | Broken seed + diagnostics → Pi fix → Host.compile |
| `patch` | Existing source + intent → Pi rewrite → Host.patch |

Failed compile gets **one** automatic repair turn through Pi before grading.
