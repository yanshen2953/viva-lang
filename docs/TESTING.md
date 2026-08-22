# Testing

Two tracks:

| Track | Who runs | Purpose |
| --- | --- | --- |
| **Deterministic** | vitest | Corpus / IR / layer props / Host API without LLM |
| **Agent exam** | **Pi + DeepSeek** as SUT | NL→Viva, repair, patch; graded by `VivaAgentHost` |

## Deterministic

```bash
npm test
```

- `tests/corpus/` + `examples/exam/` — Tree-sitter-style contracts (layers, frame, chart)
- `tests/exam/*.test.ts` — IR / fake-DOM layer semantics / Host session

## Agent exam (requires API key)

Pi is the **agent under test**, not the author of the suite.

See [`tests/agent-exam/README.md`](../tests/agent-exam/README.md).

```bash
export PATH="$HOME/.npm-global/bin:$PATH"
export DEEPSEEK_API_KEY=...
npx vite-node scripts/run-agent-exam.ts
```

Default model: `deepseek-v4-flash-vision-exp`.

## What not to confuse

- Do **not** use Pi to invent corpus fixtures as a substitute for this track.
- Do **not** commit `.env` / API keys.
- Visual pixel goldens (matplotlib/ggplot style) are optional later; agent exam asserts compile + structural contracts first.
