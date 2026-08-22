# dashboard

Optional single-shot handbook for product / ops dashboards.
Do **not** invent new Viva syntax. Output remains pure Viva source.

## Intent

Readable interactive ops UI: clear hierarchy, dense-but-scannable panels, not print-journal and not neon arcade.

## Defaults

- Use `role` on panels/marks; `colorBy` + `palette: categorical` for grouped data — pass `handbooks: ["dashboard"]` on compile **only when needed**.
- Dark or light ground OK; keep contrast high for labels and values.
- Prefer flat panel fills (`#0f172a` / `#f8fafc` family); thin separators over heavy glow.
- Avoid `glow` / large `blur` on chrome; data marks may use modest emphasis.
- Title/HUD text larger than annotations; keep one accent color for selection/threshold.
- Prefer `widget chart.*` for series panels instead of hand-drawn axes when possible.
- Interaction: click-to-select, drag for thresholds/parameters, timeline for year scrub when time matters.

## Non-goals

- No print-only sparse figures (use `print-nature` for that).
- Do not invent CSS grid / HTML layout; stay in Viva scene coordinates.
