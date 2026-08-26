/**
 * Probe layout propsToBBox vs browser getBBox for rotated / wrapped / colorbar titles.
 * Run: npx vite-node --config vitest.config.ts scripts/probe-node-bbox.mts
 */
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { compileSource } from "../src/pipeline.js";
import { flattenNodesFromIr, renderSvgFromIr } from "../src/export/static-svg.js";
import { propsToBBox } from "../src/layout/node-bbox.js";

const CHROME = [
  "/usr/local/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
].find((p) => existsSync(p));
if (!CHROME) throw new Error("google-chrome required");

const SRC = `artifact BBox
data cells = [
  { x: 0, y: 0, z: 1 },
  { x: 1, y: 0, z: 2 },
  { x: 0, y: 1, z: 3 },
  { x: 1, y: 1, z: 4 }
]
scene
  unit: mm
  column: single
  width: 89
  height: 72
  background: #ffffff
widget chart.heatmap
  data: cells
  xField: x
  yField: y
  zField: z
  title: "Twelve-week cardiac response across visit windows"
  xLabel: Time (week)
  yLabel: "心率 (次每分)"
  zLabel: "AURORA INDEX"
  xlim: -0.5 1.5
  ylim: -0.5 1.5
  zlim: 0 4
`;

const compiled = compileSource(SRC, "bbox.viva", { handbookIds: ["print-nature"] });
if (compiled.error) throw new Error(compiled.error);
const ir = compiled.ir!;
const { nodes } = flattenNodesFromIr(ir);
const svg = renderSvgFromIr(ir);
const titleXml = [...svg.matchAll(/<text[^>]*data-viva-name="__chart_1_title[^"]*"[^>]*>[\s\S]*?<\/text>/g)];
console.log("svg root", svg.match(/<svg[^>]+>/)?.[0]);
console.log("title xml", titleXml.join("\n"));

const interesting = nodes.filter((n) =>
  /(_title|_yTitle|_cbarTitle|_xTitle)/.test(n.name),
);
console.log("named chrome nodes:");
for (const n of interesting) {
  const box = propsToBBox(n.props);
  console.log(
    `  ${n.name} text=${JSON.stringify(n.props.text)} rotate=${n.props.rotate ?? 0} font=${n.props.font ?? n.props.fontSize} tracking=${n.props.letterSpacing ?? n.props.tracking ?? 0} align=${n.props.align} x=${n.props.x} y=${n.props.y} layout=${JSON.stringify(box)}`,
  );
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
const measured = await page.evaluate((names: string[]) => {
  const svg = document.querySelector("svg") as SVGSVGElement | null;
  const ctm = svg?.getScreenCTM();
  const inv = ctm ? ctm.inverse() : null;
  const out: Record<
    string,
    { raw: { x: number; y: number; w: number; h: number }; vis: { x: number; y: number; w: number; h: number } } | null
  > = {};
  for (const name of names) {
    const el = document.querySelector(`[data-viva-name="${name}"]`) as SVGGraphicsElement | null;
    if (!el || typeof el.getBBox !== "function") {
      out[name] = null;
      continue;
    }
    const b = el.getBBox();
    const r = el.getBoundingClientRect();
    let vis = { x: r.x, y: r.y, w: r.width, h: r.height };
    if (inv && svg) {
      const p0 = svg.createSVGPoint();
      p0.x = r.left;
      p0.y = r.top;
      const p1 = svg.createSVGPoint();
      p1.x = r.right;
      p1.y = r.bottom;
      const a = p0.matrixTransform(inv);
      const c = p1.matrixTransform(inv);
      vis = { x: a.x, y: a.y, w: c.x - a.x, h: c.y - a.y };
    }
    out[name] = { raw: { x: b.x, y: b.y, w: b.width, h: b.height }, vis };
  }
  return out;
}, interesting.map((n) => n.name));
await browser.close();

const rel = (a: number, b: number) => (Math.abs(b) < 1e-6 ? 0 : Math.abs(a - b) / Math.abs(b));
let worst = 0;
console.log("\nname | layout x,y,w,h | browser x,y,w,h | relW relH relX relY");
for (const n of interesting) {
  const layout = propsToBBox(n.props);
  const pair = measured[n.name];
  if (!pair) {
    console.log(`${n.name} | MISSING in browser`);
    continue;
  }
  const br = pair.vis;
  const eW = rel(layout.w, br.w);
  const eH = rel(layout.h, br.h);
  const eCx = Math.abs(layout.x + layout.w / 2 - (br.x + br.w / 2)) / Math.max(br.w, 1);
  const eCy = Math.abs(layout.y + layout.h / 2 - (br.y + br.h / 2)) / Math.max(br.h, 1);
  worst = Math.max(worst, eW, eH, eCx, eCy);
  console.log(
    `${n.name} | layout ${layout.x.toFixed(2)},${layout.y.toFixed(2)},${layout.w.toFixed(2)},${layout.h.toFixed(2)} | raw ${pair.raw.x.toFixed(2)},${pair.raw.y.toFixed(2)},${pair.raw.w.toFixed(2)},${pair.raw.h.toFixed(2)} | vis ${br.x.toFixed(2)},${br.y.toFixed(2)},${br.w.toFixed(2)},${br.h.toFixed(2)} | ${(eW * 100).toFixed(1)}% ${(eH * 100).toFixed(1)}% cx${(eCx * 100).toFixed(1)}% cy${(eCy * 100).toFixed(1)}%`,
  );
}
console.log(`worst size/center relative error: ${(worst * 100).toFixed(1)}%`);
