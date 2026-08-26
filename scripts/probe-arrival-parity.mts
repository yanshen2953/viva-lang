import { existsSync, readFileSync } from "node:fs";
import { compileSource } from "../src/pipeline.js";
import { compareSvgPdfPages } from "../src/check/visual-parity.js";
import { SYSTEM_PROMPT_SLIM } from "../src/llm/system-prompt-slim.js";

const PRINT = { handbookIds: ["print-nature"] } as const;

async function reportOf(name: string, src: string) {
  const result = compileSource(src, `${name}.viva`, PRINT);
  if (result.error) return { name, error: result.error };
  const report = await compareSvgPdfPages(result.ir!, { width: 640 });
  return {
    name,
    pdfRaster: report.pdfRaster,
    minInkIou: report.minInkIou,
    maxMse: report.maxMse,
    sidecarOverlap: report.sidecarOverlap,
    pages: report.pages,
    painted: report.paintedIds.length,
    idEqual: report.idEqual,
  };
}

const start = SYSTEM_PROMPT_SLIM.indexOf('\nartifact "Name"');
const end = SYSTEM_PROMPT_SLIM.indexOf("\n\nUse the Capabilities");
const skeleton = SYSTEM_PROMPT_SLIM.slice(start, end).trim();
const extras = [
  "/opt/cursor/artifacts/deepseek-arrival.viva",
  "/opt/cursor/artifacts/agent-loop-live.viva",
  "/opt/cursor/artifacts/h09-arrival.viva",
].filter((p) => existsSync(p));

const jobs = [
  reportOf("arrival", readFileSync("examples/arrival.viva", "utf8")),
  reportOf("slim-skeleton", skeleton),
  ...extras.map((p) => reportOf(p, readFileSync(p, "utf8"))),
];
for (const row of await Promise.all(jobs)) console.log(JSON.stringify(row));
