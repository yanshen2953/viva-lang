# Minimal Viva Agent Host (≤50 lines)

Any IDE / chat agent can embed Viva with the same API. Playground dogfoods this path.

```ts
import {
  createVivaAgentHost,
  promptServiceWithHandbooks,
} from "viva-lang/agent";

const host = createVivaAgentHost({
  prompt: promptServiceWithHandbooks({
    // optional style plugins for this call only
  }),
});

const session = host.createSession({
  mount: document.getElementById("panel"),
  statePolicy: "preserve-data",
  handbooks: ["print-nature"],
});

// 1) build LLM messages
const bundle = host.prompt.buildPromptBundle(["print-nature"]);
const messages = [
  ...bundle.asSystemParts().map((content) => ({ role: "system", content })),
  { role: "user", content: "Scatter of pressure vs time with frame scales" },
];

// 2) model returns Viva source only
const raw = await yourModel(messages);
const source = host.prompt.assertVivaSource(raw);

// 3) compile + mount
const result = session.compile(source, {
  reason: "generate",
  promptDigest: "…",
  handbooks: ["print-nature"],
});
if (!result.ok) {
  // repair turn with diagnostics
  const repair = host.prompt.buildPromptBundle(["print-nature"], result.diagnostics);
}

// 4) later turns
session.patch(updatedSource, { reason: "user-edit" });

// 5) audit
const bundleOut = session.exportProvenanceBundle();
downloadJson(bundleOut);
```

## Ports on the same host

- `host.pipeline.register(def)` / `run(id, { values: { __sessionId } })`
- `host.domains.open({ resource, session, mount })`
- `host.provenance.list(session.id)`

See also:

- Web agent embed → [`web-embed.md`](./web-embed.md)
- Bash / CLI → [`bash.md`](./bash.md)
- Visual review → [`review.md`](./review.md)
- Installers → [`../../install/README.md`](../../install/README.md)

Sessions support `compile`/`patch`, `simulate({ ticks, events })` (headless), `exportPackage()` / `exportVectorPackage()`, and `createReview()` for human-in-the-loop repair briefs.
