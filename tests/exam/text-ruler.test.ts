/**
 * R1-A: the ruler. Layout, browser, and PDF must measure the same string to
 * the same width. Without this no spacing claim is verifiable, so the
 * thresholds are hard and the corpus keeps the pathological cases.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { LATIN_FONT_STACK, measureText } from "../../src/metrics/text.js";
import { embedPdfFonts, pdfTextRuns, pdfTextWidth, type PdfTextFonts } from "../../src/export/pdf-font.js";
import { injectBundledCjkFace, withCjkFallback } from "./load-cjk-face.js";

/** Worst relative error allowed between any two rulers. */
const TOLERANCE = 0.02;

const CORPUS: { text: string; size: number }[] = [
  { text: "Response", size: 9 },
  { text: "Sum score", size: 9 },
  { text: "Visit", size: 8 },
  { text: "WWWWWWWW", size: 8 },
  { text: "iiiiiiii", size: 8 },
  { text: "0.25", size: 8 },
  { text: "Time (week)", size: 9 },
  { text: "AURORA INDEX", size: 10 },
  { text: "-1.5", size: 7 },
  { text: "心率 (次每分)", size: 9 },
  { text: "十二周应答", size: 9 },
  { text: "夜港 HARBOR", size: 12 },
  { text: "Figure 1 · n=248", size: 8 },
  { text: "span 1 = 89 mm", size: 7 },
];

const CHROME = [
  "/usr/local/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
].find((p) => existsSync(p));

function pdfWidth(fonts: PdfTextFonts, text: string, size: number): number {
  return pdfTextRuns(fonts, text).reduce((sum, run) => sum + pdfTextWidth(run.font, run.text, size), 0);
}

describe("R1-A text ruler", () => {
  let browser: Browser | undefined;
  let page: Page | undefined;
  let fonts: PdfTextFonts;
  let browserWidths: number[] = [];
  let resolvedFont = "";

  beforeAll(async () => {
    const pdf = await PDFDocument.create();
    fonts = await embedPdfFonts(pdf);
    if (!CHROME) return;
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu"],
    });
    page = await browser.newPage();
    await page.setContent("<html><body><svg id='s' width='900' height='200'></svg></body></html>");
    await injectBundledCjkFace(page);
    const stack = withCjkFallback(LATIN_FONT_STACK);
    browserWidths = await page.evaluate(
      (items: { text: string; size: number }[], faceStack: string) => {
        const svg = document.getElementById("s") as unknown as SVGSVGElement;
        const out: number[] = [];
        for (const item of items) {
          const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
          t.setAttribute("font-family", faceStack);
          t.setAttribute("font-size", String(item.size));
          t.textContent = item.text;
          svg.appendChild(t);
          out.push((t as SVGTextContentElement).getComputedTextLength());
          svg.removeChild(t);
        }
        return out;
      },
      CORPUS,
      stack,
    );
    resolvedFont = await page.evaluate((stack: string) => {
      const probe = document.createElement("span");
      probe.style.fontFamily = stack;
      document.body.appendChild(probe);
      const used = getComputedStyle(probe).fontFamily;
      probe.remove();
      return used;
    }, LATIN_FONT_STACK);
  }, 90_000);

  afterAll(async () => {
    await browser?.close();
  });

  it("measures the same width as the PDF font, including mixed CJK and Latin", () => {
    const bad: string[] = [];
    for (const { text, size } of CORPUS) {
      const layout = measureText(text, size);
      const pdf = pdfWidth(fonts, text, size);
      const err = Math.abs(layout - pdf) / pdf;
      if (err > TOLERANCE) bad.push(`${text}@${size}: layout=${layout.toFixed(2)} pdf=${pdf.toFixed(2)} err=${(err * 100).toFixed(1)}%`);
    }
    expect(bad).toEqual([]);
  });

  it("splits mixed text so Latin inside CJK keeps the Latin face", () => {
    const runs = pdfTextRuns(fonts, "夜港 HARBOR");
    expect(runs.length).toBeGreaterThan(1);
    expect(runs.map((r) => r.text).join("")).toBe("夜港 HARBOR");
    const latin = runs.find((r) => r.text.includes("HARBOR"));
    expect(latin).toBeTruthy();
    expect(latin!.font).toBe(fonts.latin);
    const wide = runs.find((r) => r.text.includes("夜"));
    expect(wide!.font).toBe(fonts.hasCjk ? fonts.rich : fonts.latin);
  });

  it("measures the same width as the browser text length", ({ skip }) => {
    if (!CHROME) skip();
    expect(resolvedFont, "browser must resolve the declared Latin stack").toContain("Helvetica");
    const bad: string[] = [];
    for (let i = 0; i < CORPUS.length; i++) {
      const { text, size } = CORPUS[i]!;
      const layout = measureText(text, size);
      const browserWidth = browserWidths[i]!;
      const err = Math.abs(layout - browserWidth) / browserWidth;
      if (err > TOLERANCE) bad.push(`${text}@${size}: layout=${layout.toFixed(2)} browser=${browserWidth.toFixed(2)} err=${(err * 100).toFixed(1)}%`);
    }
    expect(bad).toEqual([]);
  });

  it("keeps browser and PDF rulers agreeing with each other", ({ skip }) => {
    if (!CHROME) skip();
    const bad: string[] = [];
    for (let i = 0; i < CORPUS.length; i++) {
      const { text, size } = CORPUS[i]!;
      const browserWidth = browserWidths[i]!;
      const pdf = pdfWidth(fonts, text, size);
      const err = Math.abs(browserWidth - pdf) / pdf;
      if (err > TOLERANCE) bad.push(`${text}@${size}: browser=${browserWidth.toFixed(2)} pdf=${pdf.toFixed(2)} err=${(err * 100).toFixed(1)}%`);
    }
    expect(bad).toEqual([]);
  });
});
