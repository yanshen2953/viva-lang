#!/usr/bin/env node
/**
 * Exam UI scene runner (Godot GdUnit SceneRunner analog).
 *
 * Loads each examples/exam/*.viva into the running Vite playground and asserts
 * the *real* rendered SVG DOM: z-order (layer group ordering + hit-testing),
 * layer opacity, visible:false, blend mode, and whole-layer blur/glow filter.
 * Numbers are read straight from the DOM, so this is the end-to-end counterpart
 * to the node-level IR/paint tests in tests/exam.
 *
 * Prerequisites:
 *   - `npm run dev` (Vite on :5173)
 *   - Chrome at $CHROME_PATH (default /usr/local/bin/google-chrome)
 *   - puppeteer-core is available in the environment (used by test-arena-ui.mjs)
 *
 * Run:
 *   node scripts/exam-layers-ui.mjs
 *   SERVER_URL=http://localhost:5173 node scripts/exam-layers-ui.mjs
 *
 * Exits non-zero if any case fails.
 */
import { readFileSync, readdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:5173";
const CHROME_PATH = process.env.CHROME_PATH ?? "/usr/local/bin/google-chrome";
const EXAM_DIR = new URL("../examples/exam/", import.meta.url).pathname;
const CASES = readdirSync(EXAM_DIR)
  .filter((f) => f.endsWith(".viva"))
  .sort();

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1400,900"],
  defaultViewport: { width: 1400, height: 900 },
});

const page = await browser.newPage();
page.setDefaultTimeout(20000);
const log = [];
const failures = [];

async function loadCase(name, src) {
  await page.evaluate((source) => {
    const ta = document.querySelector("#source");
    ta.value = source;
    document.querySelector("#run").click();
  }, src);
  await page.waitForFunction(
    (n) => {
      const status = document.querySelector("#status")?.textContent ?? "";
      const svg = document.querySelector("svg.viva-scene");
      return svg && status.includes(n);
    },
    { timeout: 10000 },
    name.replace("C1_", "").replace("S1_", "").replace("L1_", "").replace("L2_", "").replace("L3_", "").replace("L4_", "").replace("L5_", ""),
  );
  await new Promise((r) => setTimeout(r, 120));
}

async function layerGroups() {
  return page.$$eval("svg.viva-scene > g[data-viva-layer-id]", (gs) =>
    gs.map((g) => ({
      name: g.getAttribute("data-viva-layer"),
      id: g.getAttribute("data-viva-layer-id"),
      opacity: g.getAttribute("opacity"),
      display: g.style.display,
      blend: g.style.mixBlendMode,
      filter: g.getAttribute("filter"),
    })),
  );
}

async function hitTest(vbx, vby) {
  return page.evaluate(
    ({ vbx, vby }) => {
      const svg = document.querySelector("svg.viva-scene");
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const cx = rect.left + (vbx / Math.max(vb.width || 1, 1)) * rect.width;
      const cy = rect.top + (vby / Math.max(vb.height || 1, 1)) * rect.height;
      const el = document.elementFromPoint(cx, cy);
      return {
        cx,
        cy,
        name: el?.getAttribute("data-viva-name") ?? null,
        id: el?.getAttribute("data-viva-id") ?? null,
        layer: el?.closest("g[data-viva-layer-id]")?.getAttribute("data-viva-layer") ?? null,
      };
    },
    { vbx, vby },
  );
}

async function runCase(name, src) {
  await loadCase(name, src);
  const groups = await layerGroups();
  const names = groups.map((g) => g.name);
  const result = { case: name, names, checks: {}, ok: true };
  const state = JSON.parse(JSON.stringify(result));

  switch (name) {
    case "L1_zorder.viva": {
      result.checks.layerOrder = names;
      result.checks.hit = await hitTest(160, 140); // overlap center of back/front
      result.ok =
        JSON.stringify(names) === JSON.stringify(["bottom", "top"]) &&
        result.checks.hit.name === "front" &&
        result.checks.hit.layer === "top";
      break;
    }
    case "L2_opacity.viva": {
      const mist = groups.find((g) => g.name === "mist");
      result.checks.opacity = mist?.opacity ?? null;
      result.ok = mist?.opacity === "0.5";
      break;
    }
    case "L3_visible_false.viva": {
      const hidden = groups.find((g) => g.name === "hidden");
      result.checks.display = hidden?.display ?? null;
      result.checks.hit = await hitTest(160, 140); // should NOT hit `secret`
      result.ok = hidden?.display === "none" && result.checks.hit.name !== "secret";
      break;
    }
    case "L4_blend.viva": {
      const glowLayer = groups.find((g) => g.name === "glowLayer");
      result.checks.blend = glowLayer?.blend ?? null;
      result.ok = glowLayer?.blend === "screen";
      break;
    }
    case "L5_blur_glow.viva": {
      const soft = groups.find((g) => g.name === "soft");
      result.checks.filter = soft?.filter ?? null;
      const prims = await page.$$eval("svg.viva-scene defs filter", (fs) =>
        fs.map((f) => [...f.children].map((c) => c.tagName)),
      );
      result.checks.filterPrimitives = prims;
      result.ok =
        Boolean(soft?.filter?.startsWith("url(#")) &&
        prims.some((tags) => tags.includes("feGaussianBlur") && tags.includes("feFlood"));
      break;
    }
    default:
      result.checks.skipped = true;
      result.ok = true;
  }

  log.push(JSON.stringify(result));
  if (!result.ok) failures.push(name);
  return result;
}

await page.goto(SERVER_URL, { waitUntil: "networkidle0" });
await page.evaluate(() => location.reload());
await page.waitForSelector("#source");
await page.waitForSelector("#run");
await page.waitForSelector("svg.viva-scene");

for (const file of CASES) {
  const src = readFileSync(new URL(`../examples/exam/${file}`, import.meta.url), "utf8");
  try {
    await runCase(file, src);
  } catch (err) {
    failures.push(file);
    log.push(`ERROR ${file}: ${err.message}`);
  }
}

await browser.close();

const summary = { ok: failures.length === 0, failures, cases: CASES.length, log };
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exit(1);
