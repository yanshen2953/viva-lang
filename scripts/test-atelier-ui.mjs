import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1400,900"],
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.evaluate(() => location.reload());
await page.waitForSelector("#examples");
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("#examples button")].find(
    (b) => b.textContent?.trim() === "Atelier",
  );
  if (!btn) throw new Error("Atelier tab missing");
  btn.click();
});
await page.waitForFunction(() =>
  document.querySelector("#status")?.textContent?.includes("Atelier"),
);
await new Promise((r) => setTimeout(r, 800));

const report = await page.evaluate(() => {
  const layers = [...document.querySelectorAll("svg.viva-scene > g[data-viva-layer]")].map(
    (g) => ({
      name: g.getAttribute("data-viva-layer"),
      opacity: g.getAttribute("opacity"),
      blend: g.style.mixBlendMode || null,
      children: g.querySelectorAll("[data-viva-id]").length,
    }),
  );
  const grads = document.querySelectorAll("svg.viva-scene defs linearGradient").length;
  const filters = document.querySelectorAll("svg.viva-scene defs filter").length;
  const glowOrbs = [...document.querySelectorAll('[data-viva-group="orbs"]')].map((el) =>
    el.getAttribute("filter"),
  );
  const title = document.querySelector('[data-viva-name="title"]');
  return {
    status: document.querySelector("#status")?.textContent,
    layers,
    grads,
    filters,
    glowOrbs,
    titleWeight: title?.getAttribute("font-weight"),
    titleSize: title?.getAttribute("font-size"),
    titleLetter: title?.getAttribute("letter-spacing"),
  };
});

await page.screenshot({ path: "/opt/cursor/artifacts/atelier_01_loaded.png", fullPage: true });

// Drag an orb
const orb = await page.$('[data-viva-group="orbs"]');
const box = await orb.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + 60, box.y - 40, { steps: 12 });
await page.mouse.up();
await new Promise((r) => setTimeout(r, 300));

// Click a card
const card = await page.$('[data-viva-group="cards"]');
const cbox = await card.boundingBox();
await page.mouse.click(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2);
await new Promise((r) => setTimeout(r, 300));
const detail = await page.$eval('[data-viva-name="detail"]', (el) => el.textContent).catch(() => null);

await page.screenshot({ path: "/opt/cursor/artifacts/atelier_02_interact.png", fullPage: true });

const ok =
  report.layers.length >= 4 &&
  report.grads >= 2 &&
  report.filters >= 1 &&
  report.glowOrbs.some((f) => f && f.includes("url")) &&
  report.titleWeight === "700" &&
  Boolean(detail);

console.log(
  JSON.stringify(
    {
      ok,
      detail,
      report,
    },
    null,
    2,
  ),
);
await browser.close();
if (!ok) process.exit(1);
