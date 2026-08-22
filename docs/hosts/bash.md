# Bash / zsh agent interface

After install (`install/install.sh` or `npm i -g viva-lang`), coding agents use the `viva` binary.

## Commands

```bash
viva version
viva compile examples/hello.viva
viva html examples/hello.viva -o hello.html
viva svg examples/charts.viva -o charts.svg
viva export examples/charts.viva -f png -o charts.png
viva export examples/charts.viva -f jpg --width 1600 -o charts.jpg
viva export examples/charts.viva -f pdf -o charts.pdf      # vector PDF (geometry 1:1, default)
viva export examples/charts.viva -f pdf-raster -o r.pdf   # PNG-in-PDF fallback
viva simulate examples/exam/P1_param_lab.viva --ticks 10
viva prompt --handbook print-nature
viva serve --port 8765
```

## Typical agent loop

```bash
# 1) get system prompt
SYS=$(viva prompt --handbook print-nature)

# 2) model emits Viva → save as out.viva

# 3) compile / repair
viva compile out.viva || true

# 4) export takeaway
viva export out.viva -f pdf -o out.pdf      # vector
viva export out.viva -f svg -o out.svg
viva export out.viva -f jpg -o out.jpg
```

## HTTP bridge

`viva serve` exposes compile/export for agents that prefer HTTP over CLI (see [`web-embed.md`](./web-embed.md)).

## Install

| OS | Command |
| --- | --- |
| Linux / macOS | `bash install/install.sh` |
| Windows | `powershell -File install/install.ps1` |
| npm (all) | `npm install -g viva-lang` or `npm install -g ./viva-lang-*.tgz` |

Requires **Node.js ≥ 18**.
