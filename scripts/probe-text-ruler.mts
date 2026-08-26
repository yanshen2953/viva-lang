/**
 * Probe the three rulers: layout measureText(), browser text length, PDF font.
 * Run: npx vite-node --config vitest.config.ts scripts/probe-text-ruler.mts
 */
import { existsSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import puppeteer from "puppeteer-core";
import { LATIN_FONT_STACK, measureText } from "../src/metrics/text.js";
import { embedPdfFonts, pdfTextRuns, pdfTextWidth } from "../src/export/pdf-font.js";

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
];

const CHROME = [
  "/usr/local/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
].find((p) => existsSync(p));
if (!CHROME) throw new Error("google-chrome required");

const pdf = await PDFDocument.create();
const fonts = await embedPdfFonts(pdf);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setContent("<html><body><svg id='s' width='800' height='200'></svg></body></html>");

const browserWidths: number[] = await page.evaluate(
  (items: { text: string; size: number }[], stack: string) => {
    const svg = document.getElementById("s") as unknown as SVGSVGElement;
    const out: number[] = [];
    for (const item of items) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("font-family", stack);
      t.setAttribute("font-size", String(item.size));
      t.textContent = item.text;
      svg.appendChild(t);
      out.push((t as SVGTextContentElement).getComputedTextLength());
      svg.removeChild(t);
    }
    return out;
  },
  CORPUS,
  LATIN_FONT_STACK,
);

const usedFont: string = await page.evaluate((stack: string) => {
  const probe = document.createElement("span");
  probe.style.fontFamily = stack;
  document.body.appendChild(probe);
  const used = getComputedStyle(probe).fontFamily;
  probe.remove();
  return used;
}, LATIN_FONT_STACK);

await browser.close();

const rel = (a: number, b: number) => (b === 0 ? 0 : (a - b) / b);
let maxBrowser = 0;
let maxPdf = 0;

console.log(`browser resolved font-family: ${usedFont}`);
console.log("text | size | layout | browser | pdf | vs-browser | vs-pdf");
for (let i = 0; i < CORPUS.length; i++) {
  const { text, size } = CORPUS[i]!;
  const layout = measureText(text, size);
  const bw = browserWidths[i]!;
  const pw = pdfTextRuns(fonts, text).reduce(
    (sum, run) => sum + pdfTextWidth(run.font, run.text, size),
    0,
  );
  const eb = rel(layout, bw);
  const ep = rel(layout, pw);
  maxBrowser = Math.max(maxBrowser, Math.abs(eb));
  maxPdf = Math.max(maxPdf, Math.abs(ep));
  console.log(
    `${text} | ${size} | ${layout.toFixed(2)} | ${bw.toFixed(2)} | ${pw.toFixed(2)} | ${(eb * 100).toFixed(1)}% | ${(ep * 100).toFixed(1)}%`,
  );
}
console.log(`max |err| vs browser: ${(maxBrowser * 100).toFixed(1)}%`);
console.log(`max |err| vs pdf:     ${(maxPdf * 100).toFixed(1)}%`);
