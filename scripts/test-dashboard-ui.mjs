import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1400,900"],
  defaultViewport: { width: 1400, height: 900 },
});

const page = await browser.newPage();
page.setDefaultTimeout(15000);

const log = [];
page.on("console", (msg) => {
  if (msg.type() === "error") log.push(`console.error: ${msg.text()}`);
});

await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector("#examples");

// Click Dashboard tab
await page.evaluate(() => {
  const buttons = [...document.querySelectorAll("#examples button")];
  const dash = buttons.find((b) => b.textContent?.trim() === "Dashboard");
  if (!dash) throw new Error("Dashboard button missing");
  dash.click();
});
await page.waitForFunction(
  () => document.querySelector("#status")?.textContent?.includes("Ops Dashboard"),
);
await new Promise((r) => setTimeout(r, 800));

const status1 = await page.$eval("#status", (el) => el.textContent);
const errHidden = await page.$eval("#error", (el) => el.hidden);
log.push(`loaded: status=${status1}, errorHidden=${errHidden}`);

await page.screenshot({ path: "/opt/cursor/artifacts/dashboard_01_loaded.png", fullPage: true });

// Helper: click SVG node by data-viva-name
async function clickName(name) {
  const handle = await page.$(`[data-viva-name="${name}"]`);
  if (!handle) throw new Error(`missing node ${name}`);
  const box = await handle.boundingBox();
  if (!box) throw new Error(`no box for ${name}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await new Promise((r) => setTimeout(r, 400));
}

async function textOf(name) {
  return page.$$eval(`[data-viva-name="${name}"]`, (els) =>
    els.map((el) => el.textContent || "").join(" | "),
  );
}

// Click a bar via group alias "bars" — first bar element
const bar = await page.$('[data-viva-group="bars"]');
if (!bar) throw new Error("no bars group");
const barBox = await bar.boundingBox();
await page.mouse.click(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2);
await new Promise((r) => setTimeout(r, 500));
const detailAfterSelect = await textOf("detailName");
const detailVal = await textOf("detailValue");
log.push(`after bar click: detailName=${detailAfterSelect}, detailValue=${detailVal}`);
await page.screenshot({ path: "/opt/cursor/artifacts/dashboard_02_select_bar.png", fullPage: true });

// Switch to compare mode
await clickName("modeCompare");
// Click first bar, then second bar
const bars = await page.$$('[data-viva-group="bars"]');
log.push(`bar count=${bars.length}`);
if (bars.length < 2) throw new Error("need >=2 bars");
const b0 = await bars[0].boundingBox();
const b1 = await bars[1].boundingBox();
await page.mouse.click(b0.x + b0.width / 2, b0.y + b0.height / 2);
await new Promise((r) => setTimeout(r, 400));
await page.mouse.click(b1.x + b1.width / 2, b1.y + b1.height / 2);
await new Promise((r) => setTimeout(r, 500));
const compareName = await textOf("compareName");
const selectedName = await textOf("detailName");
log.push(`compare mode: selected=${selectedName}, compare=${compareName}`);
await page.screenshot({ path: "/opt/cursor/artifacts/dashboard_03_compare.png", fullPage: true });

// Alert mode + scrub threshold track
await clickName("modeAlert");
const track = await page.$('[data-viva-name="sliderTrack"]');
const tbox = await track.boundingBox();
// pointerdown + move along track to simulate continuous scrub
await page.mouse.move(tbox.x + tbox.width * 0.2, tbox.y + tbox.height / 2);
await page.mouse.down();
await page.mouse.move(tbox.x + tbox.width * 0.75, tbox.y + tbox.height / 2, { steps: 12 });
await page.mouse.up();
await new Promise((r) => setTimeout(r, 400));
// also click at 80%
await page.mouse.click(tbox.x + tbox.width * 0.8, tbox.y + tbox.height / 2);
await new Promise((r) => setTimeout(r, 400));
const thresh = await textOf("sliderValue");
const modeHint = await textOf("modeHint3");
log.push(`after scrub: thresholdText=${thresh}, modeHint=${modeHint}`);
await page.screenshot({ path: "/opt/cursor/artifacts/dashboard_04_threshold_scrub.png", fullPage: true });

// Observe tick WITHOUT toggling play (default playing=true)
const pulseA = await textOf("pulseText");
const valA = await textOf("barValue");
await new Promise((r) => setTimeout(r, 2000));
const pulseB = await textOf("pulseText");
const valB = await textOf("barValue");
log.push(`tick animation pulseA=${pulseA} pulseB=${pulseB} changed=${pulseA !== pulseB}`);
log.push(`bar values moved: before=${valA} after=${valB} changed=${valA !== valB}`);
await page.screenshot({ path: "/opt/cursor/artifacts/dashboard_05_playing.png", fullPage: true });

// Pause via play button
await clickName("playBtn");
const pulsePause1 = await textOf("pulseText");
await new Promise((r) => setTimeout(r, 1000));
const pulsePause2 = await textOf("pulseText");
log.push(`after pause: pulse stable=${pulsePause1 === pulsePause2} (${pulsePause1})`);

// Reset
await clickName("resetBtn");
await clickName("clearBtn");
await new Promise((r) => setTimeout(r, 400));
const afterClear = await textOf("detailEmpty");
log.push(`after clear: emptyHint=${afterClear}`);
await page.screenshot({ path: "/opt/cursor/artifacts/dashboard_06_reset.png", fullPage: true });

// Layer count in DOM
const layerNames = await page.$$eval("[data-viva-name]", (els) => {
  const names = new Set(els.map((el) => el.getAttribute("data-viva-name")));
  return [...names].sort();
});
log.push(`rendered node names (${layerNames.length}): ${layerNames.join(",")}`);

console.log(JSON.stringify({ ok: true, log }, null, 2));
await browser.close();
