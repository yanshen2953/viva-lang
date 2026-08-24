import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1400,900"],
  defaultViewport: { width: 1400, height: 900 },
});

const page = await browser.newPage();
page.setDefaultTimeout(20000);
const log = [];

await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.evaluate(() => location.reload());
await page.waitForSelector("#examples");
await page.evaluate(() => {
  const buttons = [...document.querySelectorAll("#examples button")];
  const arena = buttons.find((b) => b.textContent?.trim() === "Arena");
  if (!arena) throw new Error("Arena tab missing — hard reload needed?");
  arena.click();
});
await page.waitForFunction(() =>
  document.querySelector("#status")?.textContent?.includes("Tactics Arena"),
);
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: "/opt/cursor/artifacts/arena_01_loaded.png", fullPage: true });

const textOf = async (name) =>
  page.$$eval(`[data-viva-name="${name}"]`, (els) =>
    els.map((el) => el.textContent || "").join(" | "),
  );

const centerOf = async (selector) => {
  const el = await page.$(selector);
  if (!el) throw new Error(`missing ${selector}`);
  const box = await el.boundingBox();
  if (!box) throw new Error(`no box ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box, el };
};

const dragTo = async (fromSel, toX, toY, steps = 16) => {
  const from = await centerOf(fromSel);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 350));
};

// Pause AI first so drops are deterministic (Space toggles pause)
await page.click("svg.viva-scene");
await page.keyboard.press("Space");
await new Promise((r) => setTimeout(r, 300));
log.push(`pre-drop pause=${await textOf("pauseBanner")}`);

// --- Multi-unit drag + drop onto bases ---
const units = await page.$$('[data-viva-group="units"]');
log.push(`unit count=${units.length}`);
if (units.length < 3) throw new Error("expected 3 units");

const bases = await page.$$('[data-viva-group="bases"]');
log.push(`base count=${bases.length}`);
const baseCenters = [];
for (const b of bases) {
  const box = await b.boundingBox();
  baseCenters.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
}

const dragUnitIndexTo = async (index, toX, toY) => {
  const els = await page.$$('[data-viva-group="units"]');
  const box = await els[index].boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 20 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 450));
};

await dragUnitIndexTo(0, baseCenters[0].x, baseCenters[0].y);
let owners = await textOf("baseOwner");
let drops = await textOf("dropValue");
let score = await textOf("scoreValue");
let unitPos = await page.$$eval('[data-viva-group="units"]', (els) =>
  els.map((el) => ({ cx: el.getAttribute("cx"), cy: el.getAttribute("cy") })),
);
log.push(`drop1 owners=${owners} drops=${drops} score=${score} unitPos=${JSON.stringify(unitPos)}`);
await page.screenshot({ path: "/opt/cursor/artifacts/arena_02_drop_unit1.png", fullPage: true });

await dragUnitIndexTo(1, baseCenters[1].x, baseCenters[1].y);
owners = await textOf("baseOwner");
drops = await textOf("dropValue");
score = await textOf("scoreValue");
log.push(`drop2 owners=${owners} drops=${drops} score=${score}`);
await page.screenshot({ path: "/opt/cursor/artifacts/arena_03_drop_unit2.png", fullPage: true });

await dragUnitIndexTo(2, baseCenters[2].x + 20, baseCenters[2].y + 10);
const selected = await textOf("selectedInfo");
owners = await textOf("baseOwner");
drops = await textOf("dropValue");
log.push(`drop3/multi selected=${selected} owners=${owners} drops=${drops}`);
await page.screenshot({ path: "/opt/cursor/artifacts/arena_04_multi_drag.png", fullPage: true });

// Unpause and force collision by dragging unit onto enemy
await page.keyboard.press("Space");
await new Promise((r) => setTimeout(r, 200));
// Move unit to a safe corner first to clear contact state
await dragUnitIndexTo(0, baseCenters[2].x, baseCenters[2].y + 120);
await new Promise((r) => setTimeout(r, 200));
const enemy = await centerOf('[data-viva-group="enemies"]');
const livesBefore = await textOf("livesValue");
const scoreBefore = await textOf("scoreValue");
await dragUnitIndexTo(0, enemy.x, enemy.y);
await new Promise((r) => setTimeout(r, 500));
// If enemy moved, chase once more
const enemy2 = await centerOf('[data-viva-group="enemies"]');
await dragUnitIndexTo(0, enemy2.x, enemy2.y);
await new Promise((r) => setTimeout(r, 600));
const livesAfter = await textOf("livesValue");
const scoreAfter = await textOf("scoreValue");
const msg = await textOf("status");
const collided =
  livesBefore !== livesAfter ||
  Number(scoreAfter) < Number(scoreBefore) ||
  msg.includes("撞击");
log.push(
  `collision lives ${livesBefore} -> ${livesAfter}; score ${scoreBefore} -> ${scoreAfter}; msg=${msg}; collided=${collided}`,
);
await page.screenshot({ path: "/opt/cursor/artifacts/arena_05_collision.png", fullPage: true });

// --- Keyboard pause again ---
await page.click("svg.viva-scene");
await page.keyboard.press("Space");
await new Promise((r) => setTimeout(r, 400));
const pauseText = await textOf("pauseBanner");
const msgPause = await textOf("status");
log.push(`pause banner=${pauseText} msg=${msgPause}`);
await page.screenshot({ path: "/opt/cursor/artifacts/arena_06_paused.png", fullPage: true });
await page.keyboard.press("Space");
await new Promise((r) => setTimeout(r, 200));

// Chart bars exist and animate
const sparkCount = await page.$$eval('[data-viva-group="sparks"]', (els) => els.length);
const h1 = await page.$$eval('[data-viva-group="sparks"]', (els) =>
  els.map((el) => el.getAttribute("height")),
);
await new Promise((r) => setTimeout(r, 1000));
const h2 = await page.$$eval('[data-viva-group="sparks"]', (els) =>
  els.map((el) => el.getAttribute("height")),
);
log.push(`sparks=${sparkCount} heights moved=${JSON.stringify(h1) !== JSON.stringify(h2)}`);

const okDrops = Number(drops) >= 2 || /Alpha/.test(owners);
const okMulti = Boolean(selected) && Number(drops) >= 2;
const okPause = pauseText.includes("PAUSED") || msgPause.includes("暂停");
const okCharts = sparkCount >= 4;
const okCollide = collided;

const summary = {
  ok: okDrops && okMulti && okPause && okCharts && okCollide,
  okDrops,
  okMulti,
  okPause,
  okCharts,
  okCollide,
  livesChanged: livesBefore !== livesAfter,
  log,
};
console.log(JSON.stringify(summary, null, 2));
await page.screenshot({ path: "/opt/cursor/artifacts/arena_07_final.png", fullPage: true });
await browser.close();
if (!summary.ok) process.exit(1);
