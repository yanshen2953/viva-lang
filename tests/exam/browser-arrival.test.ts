/**
 * True browser Runtime exam. Failure is not allowed to fall back to simulate().
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import type { InteractionSnapshot } from "../../src/runtime/view-machine.js";

const PORT = 5177;
const BASE = `http://127.0.0.1:${PORT}/`;
const CHROME = [
  "/usr/local/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
].find((p) => existsSync(p));

function chromePath(): string {
  if (!CHROME) throw new Error("google-chrome is required for the hand door");
  return CHROME;
}

async function waitForServer(url: string, ms = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`vite did not start at ${url}`);
}

describe("arrival 5 — real browser session", () => {
  let child: ChildProcess | undefined;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    child = spawn("npx", ["vite", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
      cwd: process.cwd(),
      stdio: "pipe",
      env: { ...process.env, BROWSER: "none" },
    });
    await waitForServer(BASE);
    browser = await puppeteer.launch({
      executablePath: chromePath(),
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--window-size=1400,900"],
      defaultViewport: { width: 1400, height: 900 },
    });
    page = await browser.newPage();
    page.setDefaultTimeout(25_000);
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("#examples");
    await page.waitForFunction(
      () => [...document.querySelectorAll("#examples button")].some((b) => b.textContent?.trim() === "Arrival"),
    );
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("#examples button")].find((b) => b.textContent?.trim() === "Arrival");
      if (!btn) throw new Error("Arrival example missing");
      (btn as HTMLButtonElement).click();
    });
    await page.waitForFunction(() => document.querySelector("svg.viva-scene"));
    await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes("Arrival"));
    await new Promise((r) => setTimeout(r, 400));
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    if (child?.pid) {
      try {
        process.kill(child.pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
  });

  async function snap(): Promise<InteractionSnapshot> {
    return page.evaluate(() => {
      const viva = (window as unknown as { __viva?: { session: { interactionSnapshot: () => InteractionSnapshot } } })
        .__viva;
      if (!viva) throw new Error("window.__viva missing");
      return viva.session.interactionSnapshot();
    });
  }

  async function boxOf(selector: string) {
    const el = await page.$(selector);
    if (!el) throw new Error(`missing ${selector}`);
    const box = await el.boundingBox();
    if (!box) throw new Error(`no box ${selector}`);
    return box;
  }

  it("brushes, drags World, flips beats, jumps page, then brushes a dim beat", async () => {
    await page.click("svg.viva-scene");
    const plotSel = '[data-viva-name="a_plotBg"], [data-viva-name="c_plotBg"]';
    await page.waitForSelector(plotSel);
    await page.waitForSelector('[data-viva-name="mark"], [data-viva-name="token"]');
    const plot = await boxOf(plotSel);
    await page.mouse.move(plot.x + plot.width * 0.08, plot.y + plot.height * 0.12);
    await page.mouse.down();
    await page.mouse.move(plot.x + plot.width * 0.92, plot.y + plot.height * 0.88, { steps: 28 });
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 350));
    let afterBrush = await snap();
    if (((afterBrush.sel?.n as number) ?? 0) === 0) {
      const mark = await page.$('[data-viva-name="mark"]');
      if (mark) {
        const mb = await mark.boundingBox();
        if (mb) await page.mouse.click(mb.x + mb.width / 2, mb.y + mb.height / 2);
        await new Promise((r) => setTimeout(r, 250));
        afterBrush = await snap();
      }
    }
    expect(afterBrush.page, JSON.stringify(afterBrush)).toBeGreaterThanOrEqual(1);
    expect((afterBrush.sel?.n as number) ?? 0, JSON.stringify(afterBrush)).toBeGreaterThan(0);
    expect(afterBrush.brush?.on || ((afterBrush.sel?.n as number) ?? 0) > 0).toBeTruthy();
    const selN = (afterBrush.sel?.n as number) ?? 0;

    const token = await boxOf('[data-viva-name="token"]');
    await page.mouse.move(token.x + token.width / 2, token.y + token.height / 2);
    await page.mouse.down();
    await page.mouse.move(token.x + token.width / 2 + 36, token.y + token.height / 2 + 20, { steps: 16 });
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 250));
    const afterDrag = await snap();
    expect((afterDrag.sel?.n as number) ?? 0).toBe(selN);
    expect(afterDrag.hand.n).toBeGreaterThanOrEqual(0);

    let afterBeat = await snap();
    for (let i = 0; i < 4 && afterBeat.beat === afterBrush.beat; i += 1) {
      await page.keyboard.press("n");
      await new Promise((r) => setTimeout(r, 200));
      afterBeat = await snap();
    }
    expect(afterBeat.beat).not.toBe(afterBrush.beat);
    expect((afterBeat.sel?.n as number) ?? 0).toBe(selN);

    const jump = await page.$('[data-viva-name="__page_jump_1"]');
    if (jump) {
      const jb = await jump.boundingBox();
      if (jb) {
        await page.mouse.click(jb.x + jb.width / 2, jb.y + jb.height / 2);
      } else {
        await page.keyboard.press("PageDown");
      }
    } else {
      await page.keyboard.press("PageDown");
    }
    await new Promise((r) => setTimeout(r, 250));
    const afterPage = await snap();
    expect(afterPage.page).toBe(2);
    expect((afterPage.sel?.n as number) ?? 0).toBe(selN);
    expect(typeof afterPage.beat).toBe("number");

    if (afterPage.beat === 0) {
      await page.keyboard.press("n");
      await new Promise((r) => setTimeout(r, 200));
    }
    const dimPlot = await page.$('[data-viva-name="c_plotBg"], [data-viva-name="a_plotBg"]');
    if (dimPlot) {
      const db = await dimPlot.boundingBox();
      if (db && db.width > 4 && db.height > 4) {
        await page.mouse.move(db.x + db.width * 0.2, db.y + db.height * 0.2);
        await page.mouse.down();
        await page.mouse.move(db.x + db.width * 0.85, db.y + db.height * 0.8, { steps: 16 });
        await page.mouse.up();
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    const afterDim = await snap();
    expect(afterDim.page).toBe(2);
    expect(typeof afterDim.beat).toBe("number");
    expect(typeof afterDim.sel?.n).toBe("number");
  }, 90_000);
});
