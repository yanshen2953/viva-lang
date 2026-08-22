import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";

await mkdir("/opt/cursor/artifacts", { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1480,980"],
  defaultViewport: { width: 1480, height: 980 },
});

const page = await browser.newPage();
page.setDefaultTimeout(25000);

await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector("#examples");

await page.evaluate(() => {
  document.querySelector("#review-bar")?.setAttribute("hidden", "");
  document.querySelector("#review-toggle")?.classList.remove("active");
});

await page.evaluate(() => {
  const btn = [...document.querySelectorAll("#examples button")].find(
    (b) => b.textContent?.trim() === "Atlas",
  );
  if (!btn) throw new Error("Atlas button missing");
  btn.click();
});

await page.waitForFunction(
  () => document.querySelector("#status")?.textContent?.includes("Figure Atlas"),
  { timeout: 20000 },
);
await new Promise((r) => setTimeout(r, 1200));

await page.screenshot({
  path: "/opt/cursor/artifacts/figure_atlas_overview.png",
  fullPage: false,
});

// Click gene toggle
const geneB = await page.$('[data-viva-name="geneBtnB"]');
if (geneB) {
  const box = await geneB.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({
      path: "/opt/cursor/artifacts/figure_atlas_gene_toggle.png",
      fullPage: false,
    });
  }
}

console.log("saved figure_atlas_*.png");
await browser.close();
