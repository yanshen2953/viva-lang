/**
 * R1-B: layout propsToBBox vs the browser's visual box (getBBox + transform).
 * Rotated axis titles, wrapped chart titles, and colorbar titles must stay
 * within 3%. The true value is the painted SVG box, not the layout estimate.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { compileSource } from "../../src/pipeline.js";
import { flattenNodesFromIr, renderSvgFromIr } from "../../src/export/static-svg.js";
import { propsToBBox, type NodeBBox } from "../../src/layout/node-bbox.js";
import { CJK_FACE, injectBundledCjkFace } from "./load-cjk-face.js";

const TOLERANCE = 0.03;

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

const CHROME = [
  "/usr/local/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
].find((p) => existsSync(p));

const INTERESTING = /(_title(?:_\d+)?|_yTitle|_cbarTitle|_xTitle)$/;

function rel(a: number, b: number): number {
  return Math.abs(b) < 1e-6 ? 0 : Math.abs(a - b) / Math.abs(b);
}

function boxErrors(layout: NodeBBox, vis: NodeBBox): { eW: number; eH: number; eCx: number; eCy: number } {
  return {
    eW: rel(layout.w, vis.w),
    eH: rel(layout.h, vis.h),
    eCx: Math.abs(layout.x + layout.w / 2 - (vis.x + vis.w / 2)) / Math.max(vis.w, 1),
    eCy: Math.abs(layout.y + layout.h / 2 - (vis.y + vis.h / 2)) / Math.max(vis.h, 1),
  };
}

function failLine(name: string, layout: NodeBBox, vis: NodeBBox, err: ReturnType<typeof boxErrors>): string {
  return `${name}: layout=${layout.x.toFixed(2)},${layout.y.toFixed(2)},${layout.w.toFixed(2)}x${layout.h.toFixed(2)} vis=${vis.x.toFixed(2)},${vis.y.toFixed(2)},${vis.w.toFixed(2)}x${vis.h.toFixed(2)} dW=${(err.eW * 100).toFixed(1)}% dH=${(err.eH * 100).toFixed(1)}% dCx=${(err.eCx * 100).toFixed(1)}% dCy=${(err.eCy * 100).toFixed(1)}%`;
}

describe("R1-B node bbox", () => {
  let browser: Browser | undefined;
  let page: Page | undefined;
  let rows: { name: string; text: string; rotate: number; layout: NodeBBox; vis: NodeBBox }[] = [];

  beforeAll(async () => {
    const compiled = compileSource(SRC, "bbox.viva", { handbookIds: ["print-nature"] });
    expect(compiled.error, compiled.error ?? "").toBeNull();
    const { nodes } = flattenNodesFromIr(compiled.ir!);
    const svg = renderSvgFromIr(compiled.ir!);
    const interesting = nodes.filter((n) => INTERESTING.test(n.name));
    expect(interesting.some((n) => /yTitle/.test(n.name))).toBe(true);
    expect(interesting.some((n) => /title_1$/.test(n.name))).toBe(true);
    expect(interesting.some((n) => /cbarTitle/.test(n.name))).toBe(true);
    if (!CHROME) return;
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu"],
    });
    page = await browser.newPage();
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await injectBundledCjkFace(page);
    await page.evaluate((face: string) => {
      for (const el of document.querySelectorAll("text")) {
        const fam = el.getAttribute("font-family") ?? "";
        if (!fam.includes(face)) el.setAttribute("font-family", fam ? `${fam}, ${face}` : face);
      }
    }, CJK_FACE);
    await page.evaluate(() => document.fonts.ready);
    const measured = await page.evaluate((names: string[]) => {
      const root = document.querySelector("svg") as SVGSVGElement | null;
      const ctm = root?.getScreenCTM();
      const inv = ctm ? ctm.inverse() : null;
      const out: Record<string, { x: number; y: number; w: number; h: number } | null> = {};
      for (const name of names) {
        const el = document.querySelector(`[data-viva-name="${name}"]`) as SVGGraphicsElement | null;
        if (!el) {
          out[name] = null;
          continue;
        }
        const r = el.getBoundingClientRect();
        if (!inv || !root) {
          out[name] = { x: r.x, y: r.y, w: r.width, h: r.height };
          continue;
        }
        const p0 = root.createSVGPoint();
        p0.x = r.left;
        p0.y = r.top;
        const p1 = root.createSVGPoint();
        p1.x = r.right;
        p1.y = r.bottom;
        const a = p0.matrixTransform(inv);
        const c = p1.matrixTransform(inv);
        out[name] = { x: a.x, y: a.y, w: c.x - a.x, h: c.y - a.y };
      }
      return out;
    }, interesting.map((n) => n.name));
    rows = interesting.map((n) => ({
      name: n.name,
      text: String(n.props.text ?? ""),
      rotate: Number(n.props.rotate ?? 0),
      layout: propsToBBox(n.props),
      vis: measured[n.name] ?? { x: 0, y: 0, w: 0, h: 0 },
    }));
  }, 90_000);

  afterAll(async () => {
    await browser?.close();
  });

  it("keeps rotate / wrap / colorbar boxes within 3% of the browser visual box", ({ skip }) => {
    if (!CHROME) skip();
    const bad: string[] = [];
    for (const row of rows) {
      const err = boxErrors(row.layout, row.vis);
      if (Math.max(err.eW, err.eH, err.eCx, err.eCy) > TOLERANCE) {
        bad.push(failLine(row.name, row.layout, row.vis, err));
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("covers the three required chrome kinds", ({ skip }) => {
    if (!CHROME) skip();
    expect(rows.some((r) => r.rotate === -90 && /yTitle/.test(r.name))).toBe(true);
    expect(rows.some((r) => /title_1$/.test(r.name))).toBe(true);
    expect(rows.some((r) => /cbarTitle/.test(r.name) && r.rotate === -90)).toBe(true);
  });

  it("names the node when a box is wrong (anti-proof)", ({ skip }) => {
    if (!CHROME) skip();
    const row = rows.find((r) => /yTitle/.test(r.name));
    expect(row).toBeTruthy();
    const sabotaged = { ...row!.layout, w: row!.layout.w * 2, x: row!.layout.x - 8 };
    const err = boxErrors(sabotaged, row!.vis);
    expect(Math.max(err.eW, err.eH, err.eCx, err.eCy)).toBeGreaterThan(TOLERANCE);
    expect(failLine(row!.name, sabotaged, row!.vis, err)).toContain(row!.name);
  });
});
