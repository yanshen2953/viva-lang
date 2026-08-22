#!/usr/bin/env npx vite-node
/**
 * Agent exam runner — Pi (DeepSeek) is the system under test.
 *
 * Flow per scenario:
 *   1) Build Viva prompt bundle (core + optional handbooks)
 *   2) Call `pi -p` with --no-tools (agent only emits text)
 *   3) Extract Viva source → VivaAgentHost.compile / patch
 *   4) If compile fails and kind allows, one repair turn
 *   5) Grade assertions; write JSON report
 *
 * Requires:
 *   export DEEPSEEK_API_KEY=...
 *   pi on PATH (npm i -g @mariozechner/pi-coding-agent or @earendil-works/pi-coding-agent)
 *
 * Usage:
 *   npx vite-node scripts/run-agent-exam.ts
 *   npx vite-node scripts/run-agent-exam.ts --only A01
 *   npx vite-node scripts/run-agent-exam.ts --model deepseek-v4-flash-vision-exp
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createVivaAgentHost } from "../src/agent/index.ts";
import { createNodePromptService } from "../src/agent/prompt.node.ts";
import { SYSTEM_PROMPT } from "../src/llm/system-prompt.ts";
import { compileSource } from "../src/pipeline.ts";

type Scenario = {
  id: string;
  title: string;
  kind: "generate" | "repair" | "patch";
  handbooks?: string[];
  prompt: string;
  seedSource?: string;
  assertions: {
    compiles?: boolean;
    mustMatch?: string[];
    forbidMatch?: string[];
    ir?: {
      minFrames?: number;
      minLayers?: number;
      layerOrder?: string[];
      hasEventTypes?: string[];
    };
  };
};

type CaseResult = {
  id: string;
  title: string;
  ok: boolean;
  attempts: number;
  error?: string;
  diagnostics?: string[];
  source?: string;
  checks: { name: string; pass: boolean; detail?: string }[];
};

const root = path.resolve(".");
const scenariosDir = path.join(root, "tests/agent-exam/scenarios");
const outDir = path.join("/opt/cursor/artifacts", "agent-exam");
const defaultModel = "deepseek-v4-flash-vision-exp";

function parseArgs(argv: string[]) {
  const only = argv.find((a) => a.startsWith("--only="))?.slice(7)
    ?? (argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : undefined);
  const model = argv.find((a) => a.startsWith("--model="))?.slice(8)
    ?? (argv.includes("--model") ? argv[argv.indexOf("--model") + 1] : defaultModel);
  return { only, model: model ?? defaultModel };
}

function loadScenarios(only?: string): Scenario[] {
  const files = readdirSync(scenariosDir).filter((f) => f.endsWith(".json")).sort();
  const list = files.map((f) =>
    JSON.parse(readFileSync(path.join(scenariosDir, f), "utf8")) as Scenario,
  );
  if (!only) return list;
  return list.filter((s) => s.id.includes(only) || s.id.startsWith(only));
}

function extractVivaSource(text: string): string {
  let src = text.trim();
  // Drop pi chatter before first artifact
  const idx = src.search(/^artifact\b/m);
  if (idx >= 0) src = src.slice(idx);
  const fence = /^```(?:viva)?\s*([\s\S]*?)```/im.exec(src);
  if (fence) src = fence[1]!.trim();
  // If still wrapped, take from artifact to end (stop at obvious trailing prose)
  const m = /^(artifact[\s\S]*?)(?:\n{2,}(?:Note|Explanation|Here|I |The |Hope)|$)/i.exec(src);
  if (m) src = m[1]!.trim();
  return src.trim();
}

function callPi(opts: {
  model: string;
  system: string;
  user: string;
}): { ok: boolean; text: string; raw: string } {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    return {
      ok: false,
      text: "",
      raw: "DEEPSEEK_API_KEY is not set",
    };
  }
  const piBin = process.env.PI_BIN ?? "pi";
  const args = [
    "-p",
    "--provider",
    "deepseek",
    "--model",
    opts.model,
    "--api-key",
    key,
    "--thinking",
    "low",
    "--no-tools",
    "--no-session",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-context-files",
    "--no-themes",
    "--system-prompt",
    opts.system,
    opts.user,
  ];
  const res = spawnSync(piBin, args, {
    encoding: "utf8",
    cwd: root,
    env: { ...process.env, DEEPSEEK_API_KEY: key, PATH: process.env.PATH },
    maxBuffer: 8 * 1024 * 1024,
    timeout: 180_000,
  });
  const raw = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim();
  if (res.error) {
    return { ok: false, text: "", raw: String(res.error) };
  }
  if (res.status !== 0 && !raw.includes("artifact")) {
    return { ok: false, text: raw, raw };
  }
  return { ok: true, text: raw, raw };
}

function fillTemplate(
  tpl: string,
  vars: Record<string, string>,
): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}

function grade(scenario: Scenario, source: string): CaseResult["checks"] {
  const checks: CaseResult["checks"] = [];
  const compiled = compileSource(source, `${scenario.id}.viva`);
  const compiles = Boolean(compiled.ir) && !compiled.error;
  if (scenario.assertions.compiles !== false) {
    checks.push({
      name: "compiles",
      pass: compiles,
      detail: compiled.error ?? undefined,
    });
  }
  for (const pat of scenario.assertions.mustMatch ?? []) {
    const re = new RegExp(pat, "m");
    checks.push({
      name: `mustMatch/${pat}`,
      pass: re.test(source),
    });
  }
  for (const pat of scenario.assertions.forbidMatch ?? []) {
    const re = new RegExp(pat, "m");
    checks.push({
      name: `forbidMatch/${pat}`,
      pass: !re.test(source),
    });
  }
  const ir = compiled.ir;
  if (ir && scenario.assertions.ir) {
    const a = scenario.assertions.ir;
    if (a.minFrames !== undefined) {
      checks.push({
        name: "ir.minFrames",
        pass: (ir.frames?.length ?? 0) >= a.minFrames,
        detail: `frames=${ir.frames?.length ?? 0}`,
      });
    }
    if (a.minLayers !== undefined) {
      checks.push({
        name: "ir.minLayers",
        pass: ir.scene.layers.length >= a.minLayers,
        detail: `layers=${ir.scene.layers.length}`,
      });
    }
    if (a.layerOrder) {
      const names = ir.scene.layers.map((l) => l.name);
      const ordered = a.layerOrder.every((n, i) => names[i] === n);
      const relative =
        a.layerOrder.length >= 2 &&
        names.indexOf(a.layerOrder[0]!) >= 0 &&
        names.indexOf(a.layerOrder[0]!) < names.indexOf(a.layerOrder[1]!);
      checks.push({
        name: "ir.layerOrder",
        pass: ordered || relative,
        detail: `got=[${names.join(",")}]`,
      });
    }
    if (a.hasEventTypes) {
      const types = new Set(ir.events.map((e) => e.type));
      const missing = a.hasEventTypes.filter((t) => !types.has(t));
      checks.push({
        name: "ir.hasEventTypes",
        pass: missing.length === 0,
        detail: missing.length ? `missing=${missing.join(",")}` : [...types].join(","),
      });
    }
  }

  // Also exercise host session path (dogfood)
  if (compiles && ir) {
    const host = createVivaAgentHost();
    const session = host.createSession({
      mount: null,
      handbooks: scenario.handbooks ?? [],
    });
    const result =
      scenario.kind === "patch"
        ? session.patch(source, { reason: "user-edit", handbooks: scenario.handbooks })
        : session.compile(source, {
            reason: scenario.kind === "repair" ? "repair" : "generate",
            handbooks: scenario.handbooks,
          });
    checks.push({
      name: "host.session.accepts",
      pass: result.ok,
      detail: result.error ?? undefined,
    });
    const bundle = session.exportProvenanceBundle();
    checks.push({
      name: "host.provenance",
      pass: bundle.records.length > 0,
      detail: bundle.records.map((r) => r.kind).join("→"),
    });
  }
  return checks;
}

function buildSystem(handbooks: string[]): string {
  const prompt = createNodePromptService();
  try {
    const bundle = prompt.buildPromptBundle(handbooks);
    return bundle.asSystemParts().join("\n\n---\n\n");
  } catch {
    return SYSTEM_PROMPT;
  }
}

function runScenario(scenario: Scenario, model: string): CaseResult {
  const seed = scenario.seedSource
    ? readFileSync(path.join(root, scenario.seedSource), "utf8")
    : "";
  let diagnostics = "";
  if (scenario.kind === "repair" && seed) {
    const broken = compileSource(seed, path.basename(scenario.seedSource!));
    diagnostics = broken.error ?? "compile failed";
  }

  const system = buildSystem(scenario.handbooks ?? []);
  let user = fillTemplate(scenario.prompt, {
    source: seed,
    diagnostics,
  });

  let attempts = 0;
  let source = "";
  let lastRaw = "";
  let lastError = "";

  const tryOnce = (userPrompt: string) => {
    attempts += 1;
    const res = callPi({ model, system, user: userPrompt });
    lastRaw = res.raw;
    if (!res.ok && !res.text.includes("artifact")) {
      lastError = res.raw;
      return null;
    }
    try {
      return extractVivaSource(res.text);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      return null;
    }
  };

  source = tryOnce(user) ?? "";
  if (!source.startsWith("artifact")) {
    return {
      id: scenario.id,
      title: scenario.title,
      ok: false,
      attempts,
      error: lastError || "no artifact in model output",
      source: lastRaw.slice(0, 2000),
      checks: [{ name: "extract", pass: false, detail: lastError }],
    };
  }

  let checks = grade(scenario, source);
  const compileCheck = checks.find((c) => c.name === "compiles");
  if (compileCheck && !compileCheck.pass && attempts < 2) {
    // One repair turn via Pi
    const repairUser = `The following Viva source failed to compile. Fix it. Output ONLY the full corrected Viva source starting with artifact.\n\nDiagnostics:\n${compileCheck.detail ?? "error"}\n\nBroken source:\n${source}`;
    const repaired = tryOnce(repairUser);
    if (repaired?.startsWith("artifact")) {
      source = repaired;
      checks = grade(scenario, source);
    }
  }

  const ok = checks.every((c) => c.pass);
  return {
    id: scenario.id,
    title: scenario.title,
    ok,
    attempts,
    source,
    diagnostics: checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail ?? "fail"}`),
    checks,
  };
}

function main() {
  const { only, model } = parseArgs(process.argv.slice(2));
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error("Missing DEEPSEEK_API_KEY. Export it before running agent exam.");
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });
  const scenarios = loadScenarios(only);
  if (!scenarios.length) {
    console.error("No scenarios matched");
    process.exit(2);
  }

  console.log(`Agent exam: model=${model} cases=${scenarios.map((s) => s.id).join(", ")}`);
  const results: CaseResult[] = [];
  for (const scenario of scenarios) {
    console.log(`\n→ ${scenario.id}: ${scenario.title}`);
    const result = runScenario(scenario, model);
    results.push(result);
    const mark = result.ok ? "PASS" : "FAIL";
    console.log(`  ${mark} (attempts=${result.attempts})`);
    for (const c of result.checks) {
      console.log(`    ${c.pass ? "✓" : "✗"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    }
    if (result.source) {
      writeFileSync(path.join(outDir, `${scenario.id}.viva`), result.source);
    }
  }

  const report = {
    model,
    ranAt: new Date().toISOString(),
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nReport: ${path.join(outDir, "report.json")}`);
  console.log(`Passed ${report.passed}/${results.length}`);
  process.exit(report.failed ? 1 : 0);
}

main();
