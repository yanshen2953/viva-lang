import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";

const artifacts = "/opt/cursor/artifacts";
await mkdir(artifacts, { recursive: true });

await new Promise((resolve, reject) => {
  const child = spawn("node", ["scripts/cleanup-artifacts.mjs"], {
    stdio: "inherit",
  });
  child.on("error", reject);
  child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`cleanup exit ${code}`))));
});

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
await page.select("#handbook-select", "print-nature");
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
await new Promise((r) => setTimeout(r, 800));

const stage = await page.$("#stage");
if (!stage) throw new Error("#stage missing");
await stage.screenshot({ path: `${artifacts}/figure_atlas_print_nature.png` });

console.log("saved figure_atlas_print_nature.png (single atlas capture)");
await browser.close();
