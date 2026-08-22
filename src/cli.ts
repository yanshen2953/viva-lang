#!/usr/bin/env node
/**
 * Viva CLI — bash/zsh embed surface for agents and humans.
 *
 *   viva compile file.viva
 *   viva export file.viva -f pdf -o out.pdf
 *   viva svg|html|simulate|prompt|version
 */
import { createServer } from "node:http";
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
import { resolveCompileHandbooks } from "./style/compile-handbooks.js";

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
    const root = path.resolve(flagValue(argv, "--root") ?? ".");
    await serveEmbed(port, root);
    return;
  }

  if (command === "models") {
    const configPath = flagValue(argv, "--config");
    const slots = resolveModelsConfig(configPath);
    console.log(JSON.stringify(describeModelSlots(slots), null, 2));
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

async function serveEmbed(port: number, root: string): Promise<void> {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      if (url.pathname === "/" || url.pathname === "/embed") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(embedIndexHtml());
        return;
      }
      if (url.pathname === "/api/compile" && req.method === "POST") {
        const body = await readBody(req);
        const payload = JSON.parse(body) as { source?: string };
        const result = compileSource(payload.source ?? "", "api.viva");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }
      if (url.pathname === "/api/export" && req.method === "POST") {
        const body = await readBody(req);
        const payload = JSON.parse(body) as { source?: string; format?: ExportFormat };
        const out = await exportArtifact(payload.source ?? "", payload.format ?? "svg");
        res.writeHead(200, {
          "content-type": out.mime,
          "content-disposition": `attachment; filename="artifact.${out.format}"`,
        });
        res.end(Buffer.from(out.bytes));
        return;
      }
      // static file under root
      const filePath = path.join(root, decodeURIComponent(url.pathname));
      if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      const data = await readFile(filePath);
      res.writeHead(200);
      res.end(data);
    } catch (err) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(err instanceof Error ? err.message : String(err));
    }
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Viva agent embed server http://127.0.0.1:${port}/embed`);
    console.log(`POST /api/compile  { "source": "..." }`);
    console.log(`POST /api/export   { "source": "...", "format": "pdf"|"jpg"|"png"|"svg" }`);
  });
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function embedIndexHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>Viva Agent Embed</title>
<style>body{font:14px/1.4 system-ui;background:#0b1220;color:#e2e8f0;margin:2rem}
code,textarea{background:#111827;color:#e2e8f0;border-radius:8px;border:1px solid #334155}
textarea{width:100%;min-height:220px;padding:12px}button{margin-top:8px;padding:8px 14px}</style>
</head><body>
<h1>Viva bash/web agent bridge</h1>
<p>POST helpers for coding agents. Interactive mount uses playground (<code>npm run dev</code>) or <code>createVivaWebEmbed</code>.</p>
<textarea id="src">artifact "Hello"
state n = 0
scene
  size: 400 200
  layer main
    node t
      x: 40
      y: 40
      text: n
event click on t
  n = n + 1
</textarea>
<p>
<button id="compile">Compile JSON</button>
<button id="pdf">Export PDF</button>
</p>
<pre id="out"></pre>
<script>
const src = () => document.getElementById('src').value;
document.getElementById('compile').onclick = async () => {
  const r = await fetch('/api/compile', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ source: src() }) });
  document.getElementById('out').textContent = await r.text();
};
document.getElementById('pdf').onclick = async () => {
  const r = await fetch('/api/export', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ source: src(), format: 'pdf' }) });
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'artifact.pdf';
  a.click();
};
</script>
</body></html>`;
}

function printHelp(): void {
  console.log(`viva <command> [file.viva] [options]

Commands:
  compile <file> [--handbook id]   Compile to Visual IR JSON
  check <file> [--visual] [--vision]  Structural + raster + optional multimodal
  models [--config path]           Show resolved base/vision model slots
  html <file> [-o out.html]        Standalone HTML shell
  svg <file> [-o out.svg]          Export static SVG
  export <file> -f <fmt>           Export svg|png|jpg|pdf (repeat --handbook for style)
  simulate <file> [--ticks N] Headless world JSON
  prompt [--handbook id]      Print system prompt (+ handbooks)
  serve [--port 8765]         Local agent HTTP embed bridge
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
