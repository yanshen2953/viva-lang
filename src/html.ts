import type { VisualIR } from "./ir.js";

export function renderStandaloneHtml(ir: VisualIR, source = ""): string {
  const payload = JSON.stringify(ir).replace(/</g, "\\u003c");
  const escapedSource = escapeHtml(source);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(ir.name)} · Viva</title>
  <style>
    html, body { margin: 0; height: 100%; background: #070b14; color: #e2e8f0; font-family: "IBM Plex Sans", sans-serif; }
    .wrap { height: 100%; display: grid; place-items: center; }
    .stage { width: min(960px, 100%); height: min(560px, 100%); }
    svg { display: block; border-radius: 16px; box-shadow: 0 24px 80px rgb(0 0 0 / 0.35); }
  </style>
</head>
<body>
  <div class="wrap"><div id="stage" class="stage"></div></div>
  <script type="application/json" id="viva-ir">${payload}</script>
  <script type="module">
    const ir = JSON.parse(document.getElementById("viva-ir").textContent);
    // Lightweight standalone note: open this file from the Viva playground or CLI after bundling runtime.
    document.getElementById("stage").dataset.source = ${JSON.stringify(escapedSource)};
    window.__VIVA_IR__ = ir;
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
