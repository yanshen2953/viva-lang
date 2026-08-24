# Viva artifact checks

Compile success is not enough for publication-ready figures. Viva runs **three layers** of automated QA.

## Layer 1 — Structural (no screenshots)

Runs on flattened geometry after compile (same ids as Runtime / `data-viva-id`).

| Code | Severity | Meaning |
| --- | --- | --- |
| `check.struct.empty` | error | No painted nodes |
| `check.struct.noMarks` | warn | Only chrome, no mark-sized geometry |
| `check.struct.tiny` | warn | Bar/cell smaller than ~1px |
| `check.struct.outOfBounds` | warn | Mark center outside scene |
| `check.struct.overlap` | warn | Heavy overlap between marks |
| `check.struct.barCrowding` | warn | Horizontal bars overlap |
| `check.struct.flatHeatmap` | error | Heat cells share one fill |
| `check.struct.chromeOverflow` | warn | Title / axis / legend / panel-label box leaves the scene or figure cell (rotate-aware, CSS px) |

**Where:** Playground, Session `patch`, `viva check`

Uses `withIrStyleContext` so `palette()` matches Runtime handbook colors.

## Layer 2 — Visual (raster heuristics)

Headless export via `@resvg/resvg-js` + `sharp` (no Puppeteer).

| Code | Severity | Meaning |
| --- | --- | --- |
| `check.visual.blank` | error | Ink ratio below threshold |
| `check.visual.flat` | warn | Too few colors on large canvas |
| `check.visual.emptyPanel` | warn | Grid panel mostly blank |

**Where:** `viva check --visual`, tests

## Layer 3 — Vision (multimodal model)

Raster screenshot + configured **vision / multimodal** model reviews layout, color, readability.

| Code | Severity | Meaning |
| --- | --- | --- |
| `check.vision.unconfigured` | error | No vision slot in config |
| `check.vision.api` | error | Provider HTTP / API failure |
| `check.vision.<code>` | warn/error | Model-reported issues |

**Where:** `viva check --vision`, programmatic `visionClient` override

Not bundled in browser Playground.

## Model configuration

Copy `viva.models.json.example` → `viva.models.json` (gitignored) or set env vars.

### File: `viva.models.json`

```json
{
  "base": {
    "provider": "openai-compatible",
    "baseUrl": "https://api.deepseek.com",
    "apiKeyEnv": "DEEPSEEK_API_KEY",
    "model": "deepseek-chat"
  },
  "vision": {
    "provider": "openai-compatible",
    "baseUrl": "https://api.deepseek.com",
    "apiKeyEnv": "DEEPSEEK_API_KEY",
    "model": "deepseek-v4-flash-vision-exp"
  }
}
```

Slots:

| Slot | Purpose |
| --- | --- |
| `base` | Text model for generate/repair agents |
| `vision` | Multimodal model for screenshot QA |
| `multimodal` | Fallback when only one model handles both |

### Custom HTTP multimodal entry

Use your own gateway as the vision provider:

```json
{
  "vision": {
    "provider": "http",
    "model": "your-vision-model",
    "httpUrl": "https://your-host/v1/viva/vision-check",
    "apiKeyEnv": "VIVA_VISION_API_KEY"
  }
}
```

**POST body**

```json
{
  "kind": "vision-check",
  "model": "your-vision-model",
  "system": "…",
  "user": "…",
  "image": { "format": "png", "base64": "…" },
  "extra": {}
}
```

**Response** (either):

- `{ "text": "{\"ok\":true,\"issues\":[]}" }` — same JSON schema as OpenAI content
- `{ "issues": [ { "severity": "warn", "code": "layout", "message": "…", "hint": "…" } ] }`

### Environment overrides

| Variable | Meaning |
| --- | --- |
| `VIVA_MODELS_CONFIG` | Path to JSON config |
| `VIVA_BASE_MODEL` | Override base model id |
| `VIVA_VISION_MODEL` | Override vision model id |
| `VIVA_VISION_HTTP_URL` | HTTP vision endpoint |
| `VIVA_VISION_PROVIDER` | `openai-compatible` \| `http` \| `pi` |

Inspect resolved slots: `viva models`

### Code injection

```ts
import { runArtifactChecks } from "viva-lang";

await runArtifactChecks(ir, {
  vision: true,
  visionClient: myMultimodalAdapter,
  source,
});
```

## CLI

```bash
npx vite-node src/cli.ts -- models
npx vite-node src/cli.ts -- check examples/figure-atlas.viva --visual --handbook print-nature
npx vite-node src/cli.ts -- check examples/figure-atlas.viva --vision --handbook print-nature
```

JSON report: `ok`, `stats`, `structural[]`, `visual[]`, `vision[]`.

Exit code `1` when any **error**-severity check fails.

## For LLM repair loops

1. Compile → structural warnings in Playground (`check:ok` / `check:N`).
2. CI → `viva check --visual` on examples (fast pixel guards).
3. Pre-publish → `viva check --vision` with your multimodal endpoint.
4. Subjective polish → review mode + agent brief.

Design principle: **chart-agnostic heuristics** + optional human-like vision review, not a fixed chart catalog.
