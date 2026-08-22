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

async function loadAtlas(handbook) {
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle0" });
  await page.waitForSelector("#examples");
  await page.evaluate(() => {
    document.querySelector("#review-bar")?.setAttribute("hidden", "");
    document.querySelector("#review-toggle")?.classList.remove("active");
  });
  await page.select("#handbook-select", handbook);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("#examples button")].find(
      (b) => b.textContent?.trim() === "Atlas",
    );
    if (!btn) throw new Error("Atlas missing");
    btn.click();
  });
  await page.waitForFunction(
    () => document.querySelector("#status")?.textContent?.includes("Figure Atlas"),
    { timeout: 20000 },
  );
  await new Promise((r) => setTimeout(r, 1000));
}

await loadAtlas("dashboard");
await page.screenshot({
  path: "/opt/cursor/artifacts/figure_atlas_dashboard.png",
  fullPage: false,
});

await loadAtlas("print-nature");
await page.screenshot({
  path: "/opt/cursor/artifacts/figure_atlas_print_nature.png",
  fullPage: false,
});

console.log("saved figure_atlas_dashboard.png and figure_atlas_print_nature.png");
await browser.close();
