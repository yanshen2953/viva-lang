# Exam corpus

Machine-checkable **input → expected IR** pairs. Each `<case>.expect.json` names a
`.viva` input (from [`examples/exam/`](../../examples/exam/)) and describes the
compiled `VisualIR` contract that `tests/exam/corpus.test.ts` asserts against.

The spirit mirrors Tree-sitter corpus files: fixed inputs, precise outputs. Here
the "output" is structural (layer order / layer props / frame scales / chart
expansion) rather than a token stream, because the compiler emits IR, not text.

| Case | Input | Contract under test |
| --- | --- | --- |
| `L1_zorder` | [`L1_zorder.viva`](../../examples/exam/L1_zorder.viva) | Layer declaration order = draw order (z-order): `bottom` then `top` |
| `L2_opacity` | [`L2_opacity.viva`](../../examples/exam/L2_opacity.viva) | Layer `opacity: 0.5` flows through to the layer prop |
| `L3_visible_false` | [`L3_visible_false.viva`](../../examples/exam/L3_visible_false.viva) | Layer `visible: false` is honored (group `display:none`) |
| `L4_blend` | [`L4_blend.viva`](../../examples/exam/L4_blend.viva) | Layer `blend: screen` is a string, not a variable lookup |
| `L5_blur_glow` | [`L5_blur_glow.viva`](../../examples/exam/L5_blur_glow.viva) | Whole-layer `blur`/`glow` props present for the `<g>` filter |
| `S1_frame_scale` | [`S1_frame_scale.viva`](../../examples/exam/S1_frame_scale.viva) | Frame scales map data domain → scene rect with no magic numbers |
| `C1_chart_scatter` | [`C1_chart_scatter.viva`](../../examples/exam/C1_chart_scatter.viva) | `widget chart.scatter` expands to frame + axes + marks layers |

## Format

Each `.expect.json`:

```json
{
  "case": "<id>",
  "input": "examples/exam/<case>.viva",
  "expect": {
    "layers": [ ... ],   // expected layer names, in z-order
    "layerProps": { "<layer>": { "<prop>": <value> } }, // optional, per-layer evaluated props
    "frames": [ ... ],   // expected frame names
    "frameProps": { "<frame>": { "<prop>": [a,b] } },   // optional
    "data": [ ... ],     // expected data decl names (C1)
    "marks": { "forItem": "...", "source": "...", "nodeName": "...", "frame": "..." }, // C1 introspect
    "scale": { "xValue": n, "expectedX": n, "xDomain": [a,b], "xRange": [a,b],
               "yValue": n, "expectedY": n, "yDomain": [a,b], "yRange": [a,b] } // S1
  }
}
```

`layerProps`/`frameProps` are compared against the **evaluated** IR props (the
IR stores `Expr`s; the runner evaluates them with `state`/`data` in scope before
comparing). `scale` is checked through `applyFrameToProps`, using the expected
values as the oracle (they are *not* recomputed by the test — they're constants
that must match the scale math).
