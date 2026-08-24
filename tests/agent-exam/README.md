# Agent exam (Pi = system under test)

Coding agent under test: **Pi** + DeepSeek (`deepseek-v4-flash-vision-exp`).
Pi talks to Viva through **MCP** (`install/pi-viva-mcp.ts` → `viva mcp` stdio). Exam allowlists `viva_compile` + `viva_prompt` only; builtin bash/edit/write stay off.
Grader: **`VivaAgentHost`** (compile / patch / provenance) + structural IR asserts.
Failed IR asserts (not only compile errors) trigger one repair turn.

Deterministic corpus: `tests/corpus/` (no LLM).

## Tracks

| Track | IDs | System | Coaching | Intent |
| --- | --- | --- | --- | --- |
| **smoke** | A01–A12 | full (+ template) | repair crib OK | language / Host smoke |
| **hard** | H01–H08 | **slim + `docs/LANGUAGE.md`** (no toy template) | **no** syntax crib by default | Cursor/Codex-aligned (docs open, task uncoached) |

Default npm script runs **hard**.

Hard track used to inline `docs/LANGUAGE.md` into `--system-prompt`. With MCP tools that dump hung DeepSeek tool loops; language docs are now **on demand** via `viva_prompt { includeLanguage: true }`.

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
npm run test:agent-exam          # hard track
npm run test:agent-exam:smoke
npm run test:agent-exam:all
npx vite-node scripts/run-agent-exam.ts --track hard --only H03
```

Artifacts: `/opt/cursor/artifacts/agent-exam/` (`report-hard.json` when track=hard).

## Hard catalog (H*)

| ID | Kind | Why hard |
| --- | --- | --- |
| H01 | generate | multipanel line+scatter + print-nature, slim system |
| H02 | generate | drag param + tick + linked chart.line; anti-toy-template |
| H03 | repair | blind multi-bug (nested frame + `widget:` + truncated assign) |
| H04 | multiturn | two intent-only edits; preserve data/frame names |
| H05 | generate | collide+key arena; forbid system-template vocabulary |
| H06 | generate | ops dashboard bar+line + threshold + dashboard handbook |
| H07 | patch | surgical timeline-only; preserve charts/data |
| H08 | generate | print scatter+line; **zero** repair turns |

## Smoke catalog (A*)

See prior A01–A12 rows (generate / repair / patch / handbook). Smoke remains the regression floor.
