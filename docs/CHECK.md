# Viva artifact checks

Compile success is not enough for publication-ready figures. Viva runs **two layers** of automated QA so agents and humans get feedback without screenshot ping-pong.

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

**Where it runs**

- Playground: every successful `patch` (status `check:ok` / `check:N`)
- Session compile via `check: { structural: true }`
- `viva check` (always)

Uses `withIrStyleContext` so `palette()` matches Runtime handbook colors.

## Layer 2 — Visual (raster)

Headless export via `@resvg/resvg-js` + `sharp` (no Puppeteer).

| Code | Severity | Meaning |
| --- | --- | --- |
| `check.visual.blank` | error | Ink ratio below threshold |
| `check.visual.flat` | warn | Too few colors on large canvas |
| `check.visual.emptyPanel` | warn | Grid panel mostly blank |

**Where it runs**

- CLI: `viva check file.viva --visual --handbook print-nature`
- Tests: `tests/exam/layout-check.test.ts`
- CI / agents: prefer `--visual` on release examples

Not bundled in the browser Playground (Node-only raster stack).

## CLI

```bash
npx vite-node src/cli.ts -- check examples/figure-atlas.viva --visual --handbook print-nature
```

JSON report: `ok`, `stats`, `structural[]`, `visual[]`.

Exit code `1` when any **error**-severity check fails.

## For LLM repair loops

1. Compile → read structural warnings in Playground or session `diagnostics`.
2. Before merge / publish → `viva check --visual` on the example corpus.
3. Use review mode for subjective polish; checks catch silent layout failures (flat heatmap, crowded bars, blank export).

Design principle: **chart-agnostic heuristics** on marks and ink, not a catalog of chart types.
