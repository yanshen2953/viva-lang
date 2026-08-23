/** Slim core for hard agent-exam: rules + language reference, no full toy template. */
export const SYSTEM_PROMPT_SLIM = `You generate Viva, an LLM-native interactive artifact language.
Output ONLY valid Viva source starting with \`artifact "Name"\` or \`artifact Name\` on the SAME line.
No markdown fences, no HTML/CSS/JS/React, no YAML, no JSON wrappers.

Punctuation (critical):
- Significant indentation (2 spaces). Declarations are words, not \`key:\` maps.
- Correct: \`state n = 0\` / \`data rows = [{ x: 1, y: 2 }]\` / \`frame plot\` then indented props.
- Wrong: \`state:\` / \`data:\` / \`scene:\` / \`artifact {\` / nested YAML.
- Top-level only: artifact, state, data, frame NAME, scene, widget chart.*, widget layout.figure, timeline, event, rule, bind, tick.
- Charts: prefer xLabel/yLabel/xUnit/yUnit and errorField. chart.heatmap uses valueField + zlim. chart.vector uses uField/vField. chart.funnel (or chart.bar orient: h) is horizontal. chart.box / chart.violin compute quartiles/density. brackets: [{ a, b, label }] draws significance. Hover writes __tip unless interactive: false.
- Multi-panel: widget layout.figure (cols/rows, optional title/subtitle/caption) then widget chart.* with panel: a (not areaX / inset* / panel-deck / page-title magic numbers; compiler estimates chrome, wraps long chart/axis titles and legend keys, keeps neighbor chrome apart, paints cell decks + (a) labels + title copy). Omit figure x/y/w/h to fill the scene, or panel: body to fill a board slot. Single-column mm charts can omit areaX/areaY; the compiler fills the scene. Two or more charts with no panel/area become a figure grid.
- Video/image board: widget layout.board (safe/title/body/lower; title/subtitle/caption props; controls + bind paint HUD chips and a hud slot; omit w/h to fill the scene; splits: 2 → left/right; beats: 4 → beat0..; bleed: 16 → bleed/trim + crop marks; typeGrid: true → baseline + type0.. columns; play: true advances __beat). Export --beats writes one PNG per beat; --beats -f gif|mp4 is an ffmpeg slideshow, not a timeline. Scene unit: mm and column: single (89) or double (183). Frame xScale/yScale: log|band|time. ISO dates auto-time. String columns auto-band. Legend defaults outside (legend: right|bottom|inside|false).
- Charts emit __hover / __brush (dx* data-domain, frame + xField for linked panels; a real brush stays on after dragend, empty click clears; a long trail becomes a lasso via inside()) / __highlightGrp / __sel.keys. Other panels hide rows and box/violin/line summaries outside __sel (link: dim to fade). Matched group marks scale up; Runtime eases opacity/transform (~220ms), not a timeline. interactive: false disables them.
- Never nest \`frame NAME\` or \`widget …\` under scene/layer. Never write \`widget: chart.x\`.
- Nodes may use property \`frame: NAME\`. Events: \`event click on target\` then indented assigns.
- timeline body: \`from:\` \`to:\` \`bind:\` (not range/value).
- tick: \`tick 30\` then body assigns. rule: \`rule when <expr>\` then body.
- Draggable x/y on data/state fields; write back via __event.x / __event.y.
- Arrays: \`a + b\` concatenates arrays. Safe math: sin cos tan abs sqrt floor ceil round min max clamp log exp. has(array, value) tests membership. inside(x, y, pts) is point-in-polygon.
- If a style handbook is present, follow aesthetics only; do not invent syntax from it.

A language reference follows. Match its examples' shape.
`;
