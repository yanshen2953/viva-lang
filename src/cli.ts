#!/usr/bin/env node
/**
 * Viva CLI — bash/zsh embed surface for agents and humans.
 *
 *   viva compile file.viva
 *   viva export file.viva -f pdf -o out.pdf
 *   viva svg|html|simulate|prompt|version
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileSource } from "./pipeline.js";
import {
  runArtifactChecks,
  describeModelSlots,
  resolveModelsConfig,
} from "./check/index.js";
import { renderStandaloneHtml } from "./html.js";
import { exportArtifact, type ExportFormat } from "./export/index.js";
import { simulate } from "./simulate.js";
import { SYSTEM_PROMPT } from "./llm/system-prompt.js";
import { createNodePromptService } from "./agent/prompt.node.js";
import { startAgentHttpServer } from "./agent/http-server.js";
import { createVivaAgentHost } from "./agent/host.js";
import { attachBuiltinPipelines } from "./agent/remote-host.js";
import { resolveCompileHandbooks } from "./style/compile-handbooks.js";
import { emptyArtifact } from "./ast.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0] ?? "help";

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "version" || command === "--version" || command === "-V") {
    const pkg = await readPackageVersion();
    console.log(pkg);
    return;
  }

  if (command === "prompt") {
    const handbooks = flagValues(argv, "--handbook");
    const prompt = createNodePromptService();
    const parts = [SYSTEM_PROMPT];
    for (const id of handbooks) {
      try {
        parts.push(prompt.loadHandbook(id));
      } catch (err) {
        console.error(err instanceof Error ? err.message : err);
        process.exitCode = 1;
        return;
      }
    }
    console.log(parts.join("\n\n---\n\n"));
    return;
  }

  if (command === "serve") {
    const port = Number(flagValue(argv, "--port") ?? "8765");
    const host = flagValue(argv, "--host") ?? "127.0.0.1";
    const root = path.resolve(flagValue(argv, "--root") ?? ".");
    const modelsConfig = flagValue(argv, "--models-config");
    const handle = await startAgentHttpServer({
      port,
      host,
      root,
      modelsConfigPath: modelsConfig,
    });
    const base = `http://${handle.host}:${handle.port}`;
    console.log(`Viva agent server ${base}/embed`);
    console.log(`GET  ${base}/api/health`);
    console.log(`GET  ${base}/api/openapi.json`);
    console.log(`POST ${base}/api/compile | /api/check | /api/export`);
    console.log(`POST ${base}/api/session | /api/pipeline/run`);
    console.log(`GET  ${base}/embed/viva-embed.js`);
    return;
  }

  if (command === "mcp") {
    const { runVivaMcpServer } = await import("./mcp/server.js");
    await runVivaMcpServer();
    return;
  }

  if (command === "models") {
    const configPath = flagValue(argv, "--config");
    const slots = resolveModelsConfig(configPath);
    console.log(JSON.stringify(describeModelSlots(slots), null, 2));
    return;
  }

  if (command === "widgets") {
    const { expandWidgets, listWidgets } = await import("./widgets.js");
    expandWidgets(emptyArtifact("_", { line: 1, column: 1 }));
    console.log(listWidgets().join("\n"));
    return;
  }

  const input = argv[1];
  if (!input) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const source = await readFile(input, "utf8");
  const outPath = flagValue(argv, "-o") ?? flagValue(argv, "--out");
  const handbookIds = resolveCompileHandbooks(argv);

  if (command === "check") {
    const visual = argv.includes("--visual");
    const vision = argv.includes("--vision");
    const modelsConfig = flagValue(argv, "--models-config");
    const result = compileSource(source, input, {
      handbookIds: handbookIds.length ? handbookIds : undefined,
      check: { structural: true },
    });
    if (!result.ir) {
      console.error(result.error);
      process.exitCode = 1;
      return;
    }
    const checks = await runArtifactChecks(result.ir, {
      structural: true,
      visual,
      vision,
      source,
      modelsConfigPath: modelsConfig,
      rasterWidth: Number(flagValue(argv, "--width") ?? "960"),
    });
    const report = {
      ok: checks.ok && (result.checkOk ?? true),
      artifact: result.ir.name,
      stats: checks.stats,
      structural: checks.structural,
      visual: checks.visual,
      vision: checks.vision,
    };
    const json = JSON.stringify(report, null, 2);
    if (outPath) {
      await mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
      await writeFile(outPath, json, "utf8");
      console.log(outPath);
    } else {
      console.log(json);
    }
    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (command === "compile") {
    const result = compileSource(source, input, handbookIds.length ? { handbookIds } : undefined);
    if (!result.ir) {
      console.error(result.error);
      process.exitCode = 1;
      return;
    }
    const json = JSON.stringify(result.ir, null, 2);
    if (outPath) {
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, json, "utf8");
      console.log(outPath);
    } else {
      console.log(json);
    }
    return;
  }

  if (command === "html") {
    const result = compileSource(source, input, handbookIds.length ? { handbookIds } : undefined);
    if (!result.ir) {
      console.error(result.error);
      process.exitCode = 1;
      return;
    }
    const html = renderStandaloneHtml(result.ir, source);
    const target = outPath ?? input.replace(/\.viva$/i, ".html");
    await writeFile(target, html, "utf8");
    console.log(target);
    return;
  }

  if (command === "svg" || command === "export") {
    const format = (
      command === "svg" ? "svg" : (flagValue(argv, "-f") ?? flagValue(argv, "--format") ?? "svg")
    ) as ExportFormat;
    const width = Number(flagValue(argv, "--width") ?? "1280");
    try {
      const result = await exportArtifact(
        source,
        format,
        { width, handbookIds: handbookIds.length ? handbookIds : undefined },
        input,
      );
      const target =
        outPath ??
        input.replace(/\.viva$/i, `.${result.format === "jpeg" ? "jpg" : result.format}`);
      await mkdir(path.dirname(path.resolve(target)), { recursive: true });
      await writeFile(target, result.bytes);
      console.log(target);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
    return;
  }

  if (command === "provenance") {
    const host = createVivaAgentHost();
    attachBuiltinPipelines(host);
    const session = host.createSession({
      mount: null,
      handbooks: handbookIds.length ? handbookIds : undefined,
    });
    const compiled = session.compile(source, {
      reason: "generate",
      handbooks: handbookIds.length ? handbookIds : undefined,
    });
    if (!compiled.ok) {
      console.error(compiled.error ?? "compile failed");
      process.exitCode = 1;
      return;
    }
    const bundle = session.exportProvenanceBundle();
    const json = JSON.stringify(bundle, null, 2);
    if (outPath) {
      await mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
      await writeFile(outPath, json, "utf8");
      console.log(outPath);
    } else {
      console.log(json);
    }
    return;
  }

  if (command === "simulate") {
    const result = compileSource(source, input, handbookIds.length ? { handbookIds } : undefined);
    if (!result.ir) {
      console.error(result.error);
      process.exitCode = 1;
      return;
    }
    const ticks = Number(flagValue(argv, "--ticks") ?? "0");
    const world = simulate(result.ir, { ticks });
    const json = JSON.stringify(world, null, 2);
    if (outPath) {
      await writeFile(outPath, json, "utf8");
      console.log(outPath);
    } else {
      console.log(json);
    }
    return;
  }

  printHelp();
  process.exitCode = 1;
}

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0) return argv[i + 1];
  const pref = argv.find((a) => a.startsWith(`${name}=`));
  return pref ? pref.slice(name.length + 1) : undefined;
}

function flagValues(argv: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name && argv[i + 1]) out.push(argv[++i]!);
  }
  return out;
}

async function readPackageVersion(): Promise<string> {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(here, "../package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { name: string; version: string };
    return `${pkg.name} ${pkg.version}`;
  } catch {
    return "viva-lang";
  }
}

function printHelp(): void {
  console.log(`viva <command> [file.viva] [options]

Commands:
  compile <file> [--handbook id]   Compile to Visual IR JSON
  check <file> [--visual] [--vision]  Structural + raster + optional multimodal
  mcp                             MCP stdio server (Cursor / Claude Desktop)
  models [--config path]           Show resolved base/vision model slots
  widgets                         List registered widget plugins
  html <file> [-o out.html]        Standalone HTML shell
  svg <file> [-o out.svg]          Export static SVG
  export <file> -f <fmt>           Export svg|png|jpg|pdf (repeat --handbook for style)
  simulate <file> [--ticks N] Headless world JSON
  provenance <file> [-o out.json]  Compile via session and export provenance bundle
  prompt [--handbook id]      Print system prompt (+ handbooks)
  serve [--port 8765] [--host 0.0.0.0]  Agent HTTP bridge (REST + embed JS)
  version                     Print package version
  help                        Show this message

Examples:
  viva models
  viva check examples/figure-atlas.viva --visual --vision --handbook print-nature
  viva export examples/figure-atlas.viva -f pdf --handbook print-nature
  viva export examples/hello.viva -f pdf-raster -o r.pdf
  viva export examples/hello.viva -f jpg --width 1600
  viva serve --port 8765

Visual review → agent brief: docs/hosts/review.md
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
