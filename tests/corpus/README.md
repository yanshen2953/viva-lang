# Exam corpus

Machine-checkable **input → expected IR** pairs. Each `<case>.expect.json` names a
`.viva` input (from [`examples/exam/`](../../examples/exam/)) and describes the
compiled `VisualIR` contract that `tests/exam/corpus.test.ts` asserts against.

Spirit: Tree-sitter corpus — fixed inputs, precise structural outputs.

## Catalog

### Layers

| Case | Contract |
| --- | --- |
| `L1_zorder` | Declaration order = draw order |
| `L2_opacity` | Layer opacity |
| `L3_visible_false` | Layer visible:false |
| `L4_blend` | `blend: screen` string coerce |
| `L5_blur_glow` | Layer blur/glow props |
| `L6_nested_for_if` | Nested `for` / `if` in scene |

### Events / world

| Case | Contract |
| --- | --- |
| `E1_click_state` | click → state |
| `E2_drag_writeback` | drag + writeback props |
| `E3_tick_rule` | tick + rule when |
| `E4_key_scene` | key on scene |
| `E5_collide` | collide + solid |
| `W1_bind` | bind + tick |
| `T1_timeline` | timeline widget expands |

### Space / charts / geometry

| Case | Contract |
| --- | --- |
| `S1_frame_scale` | linear frame mapping |
| `C1_chart_scatter` | chart.scatter expand |
| `C2_chart_line` | chart.line expand |
| `C3_chart_bar` | chart.bar + `__chartBar` |
| `G1_path` | path/`d` geometry |

### Negatives

| Case | Contract |
| --- | --- |
| `N1_resource_error` | reserved `resource` must fail compile |

## Format

See existing `.expect.json` files. Supported keys include: `layers`, `layerProps`,
`frames`, `frameProps`, `data`, `state`, `events`, `ticks`, `rules`, `binds`,
`marks`, `nestedFor`, `hasDragProp`, `hasSolidProp`, `hasPath`, `hasChartBar`,
`minFrames`, `layerNameSuffixes`, `scale`, `compileError`.
