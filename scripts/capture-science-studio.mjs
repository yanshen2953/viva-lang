import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";

await mkdir("/opt/cursor/artifacts", { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1400,900"],
  defaultViewport: { width: 1400, height: 900 },
});

const page = await browser.newPage();
page.setDefaultTimeout(20000);

await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector("#examples");

// 科学图板截图：关闭审查工具栏，避免遮挡图表
await page.evaluate(() => {
  const bar = document.querySelector("#review-bar");
  if (bar) bar.setAttribute("hidden", "");
  const toggle = document.querySelector("#review-toggle");
  toggle?.classList.remove("active");
});

await page.evaluate(() => {
  const btn = [...document.querySelectorAll("#examples button")].find(
    (b) => b.textContent?.trim() === "Studio",
  );
  if (!btn) throw new Error("Studio button missing");
  btn.click();
});
await page.waitForFunction(
  () => document.querySelector("#status")?.textContent?.includes("Science Studio"),
  { timeout: 15000 },
);
await page.evaluate(() => {
  const toggle = document.querySelector("#review-toggle");
  if (toggle?.classList.contains("active")) toggle.click();
  document.querySelector("#review-bar")?.setAttribute("hidden", "");
});
await new Promise((r) => setTimeout(r, 900));

await page.screenshot({
  path: "/opt/cursor/artifacts/science_studio_01_overview.png",
  fullPage: false,
});

// Drag PCA orbit to rotate
const orbit = await page.$('[data-viva-name="pcaOrbit"]');
if (orbit) {
  const box = await orbit.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 90, cy - 40, { steps: 12 });
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({
      path: "/opt/cursor/artifacts/science_studio_02_pca_rotated.png",
      fullPage: false,
    });
  }
}

// Mark a PCA point
const pt = await page.$('[data-viva-name="pcaPts"]');
if (pt) {
  const box = await pt.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({
      path: "/opt/cursor/artifacts/science_studio_03_pca_marked.png",
      fullPage: false,
    });
  }
}

// Zoom in
const zoomIn = await page.$('[data-viva-name="zoomIn"]');
if (zoomIn) {
  const box = await zoomIn.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({
      path: "/opt/cursor/artifacts/science_studio_04_zoom_push.png",
      fullPage: false,
    });
  }
}

console.log("screenshots saved under /opt/cursor/artifacts/science_studio_*.png");
await browser.close();
