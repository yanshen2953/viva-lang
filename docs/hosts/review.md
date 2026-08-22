# Visual review + agent feedback

Photoshop-inspired selection and rich feedback so a human (or host UI) can tell the coding agent *exactly* what is wrong — with **vector-precise** geometry shared across Runtime DOM, static SVG, and vector PDF.

## Selection tools

| Tool | Meaning |
| --- | --- |
| `rect` | Drag a box |
| `point` | Click an element (`data-viva-id`) |
| `lasso` | Freehand closed path |
| `bezier` | Cubic Bezier region (control points → sampled polygon) |

## Multi-select (combine)

Modes: `replace` | `add` | `subtract` | `intersect`, plus **invert**.

Modifier keys while dragging in the controller: **Shift = add**, **Alt = subtract**.

## Rich feedback kinds

Not only free-text notes:

`note` · `issue` · `fix` · `question` · `keep` · `constraint` · `data` · `style` · `layout` · `interaction` · `label`

Each item binds to selection ids (and optional region/anchor). `snapshot().agentBrief` is the LLM-facing repair brief.

## Session API

```ts
const review = session.createReview({ attach: true });
review.setTool("lasso");
review.setCombine("add");
review.addFeedback({ kind: "fix", text: "标题改成 42" });
const snap = review.snapshot();
// snap.sceneSvg / snap.selectionSvg / snap.agentBrief / snap.payload

await session.exportVectorPackage(); // precise SVG + vector PDF + review
```

## Embed postMessage

| command | purpose |
| --- | --- |
| `viva:reviewStart` / `Stop` | attach selection tools |
| `viva:reviewTool` / `Combine` | tool + merge mode |
| `viva:reviewFeedback` | add rich mark |
| `viva:reviewSnapshot` | emit `viva:review` with agentBrief |
| `viva:exportVector` | SVG + brief pack |

Parent receives `viva:review` whenever selection/feedback changes (`user-interact`).

## Vector export

```bash
viva export file.viva -f svg -o out.svg          # data-viva-id aligned
viva export file.viva -f pdf -o out.pdf          # true vector PDF (default)
viva export file.viva -f pdf-raster -o out.pdf   # legacy PNG-in-PDF
```

Ids in SVG match Runtime `data-viva-id` and `listSelectableNodes(ir)` so review regions map 1:1.

## Playground

`npm run dev` → **审查模式**: tools + combine + annotate → copy Brief / export selection SVG.
