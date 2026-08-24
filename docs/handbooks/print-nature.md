# print-nature

Optional single-shot handbook for scientific print figures.
Do **not** invent new Viva syntax. Output remains pure Viva source.

## Intent

Restrained, publication-like figures (Science/Nature-adjacent), not game UI.

## Defaults

- Tag nodes with `role` (`panel` `plot` `axis` `grid` `title` `mark` `legend` …) instead of hard-coding hex fills when possible.
- For series color: `colorBy: grp` + `palette: categorical` on marks inside `for` loops — compiler injects `palette(row.grp)`.
- Prefer flat fills; **avoid** `glow`, `blur`, and heavy `shadow` unless essential for emphasis.
- Thin strokes: `strokeWidth` typically 1–1.5; axes slightly stronger than data.
- High-contrast text on light or dark grounds; keep type hierarchy modest (`font` 9–14 for annotations, larger only for titles).
- Prefer colorblind-safe categorical palettes (e.g. `#0072B2` `#E69F00` `#009E73` `#CC79A7` `#56B4E9`).
- Continuous ramps: single-hue or perceptually even sequences; avoid rainbow.
- Align panels; leave clear margins; label panels as text nodes `(a)` `(b)` when multi-panel.
- Encode data with position first; color/size second.
- Until `frame`/`scale` exist, compute positions carefully and keep magic numbers consistent within one artifact.

## Non-goals

- No neon blends (`screen` glows), no large soft blurs, no decorative atmosphere layers.
- Do not reference HTML/CSS/SVG filters beyond Viva props already in the core language.
