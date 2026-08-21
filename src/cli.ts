#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { compileSource } from "./pipeline.js";
import { renderStandaloneHtml } from "./html.js";

async function main(): Promise<void> {
  const [, , command = "help", input, ...rest] = process.argv;
  if (command === "help" || command === "--help" || !input) {
    printHelp();
    return;
  }

  const source = await readFile(input, "utf8");
  const result = compileSource(source, input);
  if (!result.ir) {
    console.error(result.error);
    process.exitCode = 1;
    return;
  }

  const outFlag = rest.findIndex((arg) => arg === "-o" || arg === "--out");
  const outPath = outFlag >= 0 ? rest[outFlag + 1] : undefined;

  if (command === "compile") {
    const json = JSON.stringify(result.ir, null, 2);
    if (outPath) {
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, json, "utf8");
    } else {
      console.log(json);
    }
    return;
  }

  if (command === "html") {
    const html = renderStandaloneHtml(result.ir, source);
    const target = outPath ?? input.replace(/\.viva$/i, ".html");
    await writeFile(target, html, "utf8");
    console.log(target);
    return;
  }

  printHelp();
}

function printHelp(): void {
  console.log(`viva <command> <file.viva> [-o out]

Commands:
  compile   Compile a .viva file to Visual IR JSON
  html      Emit a standalone HTML shell
  help      Show this message
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
