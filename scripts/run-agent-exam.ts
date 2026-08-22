#!/usr/bin/env npx vite-node
/**
 * Agent exam runner — Pi (DeepSeek) is the system under test.
 *
 * Tracks:
 *   smoke (A*) — coached language smoke
 *   hard  (H*) — Cursor/Codex-aligned difficulty (slim system, no syntax crib by default)
 *
 * Usage:
 *   npx vite-node scripts/run-agent-exam.ts --track hard
 *   npx vite-node scripts/run-agent-exam.ts --track smoke
 *   npx vite-node scripts/run-agent-exam.ts --track all
 *   npx vite-node scripts/run-agent-exam.ts --only H03
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
import { SYSTEM_PROMPT_SLIM } from "../src/llm/system-prompt-slim.ts";
import { compileSource } from "../src/pipeline.ts";
import type { SceneNodeIR, VisualIR } from "../src/ir.ts";

type Track = "smoke" | "hard" | "all";

type Scenario = {
  id: string;
  title: string;
  track?: "smoke" | "hard";
  kind: "generate" | "repair" | "patch" | "multiturn";
  system?: "full" | "slim";
  handbooks?: string[];
  prompt?: string;
  seedSource?: string;
  turns?: { prompt: string }[];
  repair?: { maxAttempts?: number; syntaxCrib?: boolean };
  assertions: {
    compiles?: boolean;
    mustMatch?: string[];
    forbidMatch?: string[];
    ir?: {
      minFrames?: number;
      minLayers?: number;
      layerOrder?: string[];
      hasEventTypes?: string[];
      minTicks?: number;
      minRules?: number;
      minDataKeys?: number;
      minStateKeys?: number;
      preserveDataKeys?: string[];
      hasSolidProp?: boolean;
      hasTimeline?: boolean;
    };
  };
};

type CaseResult = {
  id: string;
  title: string;
  track: string;
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
  const only =
    argv.find((a) => a.startsWith("--only="))?.slice(7) ??
    (argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : undefined);
  const model =
    argv.find((a) => a.startsWith("--model="))?.slice(8) ??
    (argv.includes("--model") ? argv[argv.indexOf("--model") + 1] : defaultModel);
  const trackRaw =
    argv.find((a) => a.startsWith("--track="))?.slice(8) ??
    (argv.includes("--track") ? argv[argv.indexOf("--track") + 1] : "hard");
  const track = (trackRaw ?? "hard") as Track;
  return { only, model: model ?? defaultModel, track };
}

function inferTrack(s: Scenario): "smoke" | "hard" {
  if (s.track) return s.track;
  if (s.id.startsWith("H")) return "hard";
  return "smoke";
}

function loadScenarios(track: Track, only?: string): Scenario[] {
  const files = readdirSync(scenariosDir).filter((f) => f.endsWith(".json")).sort();
  let list = files.map(
    (f) => JSON.parse(readFileSync(path.join(scenariosDir, f), "utf8")) as Scenario,
  );
  if (track !== "all") {
    list = list.filter((s) => inferTrack(s) === track);
  }
  if (!only) return list;
  return list.filter((s) => s.id.includes(only) || s.id.startsWith(only));
}

function extractVivaSource(text: string): string {
  let src = text.trim();
  const idx = src.search(/^artifact\b/m);
  if (idx >= 0) src = src.slice(idx);
  const fence = /^```(?:viva)?\s*([\s\S]*?)```/im.exec(src);
  if (fence) src = fence[1]!.trim();
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
    return { ok: false, text: "", raw: "DEEPSEEK_API_KEY is not set" };
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
  if (res.error) return { ok: false, text: "", raw: String(res.error) };
  if (res.status !== 0 && !raw.includes("artifact")) {
    return { ok: false, text: raw, raw };
  }
  return { ok: true, text: raw, raw };
}

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}

function compilePattern(pat: string): RegExp {
  let flags = "m";
  let body = pat;
  const inline = /^\(\?([gimsuy]+)\)/.exec(body);
  if (inline) {
    flags = [...new Set([...flags, ...inline[1]!])].join("");
    body = body.slice(inline[0].length);
  }
  return new RegExp(body, flags);
}

function walkNodes(items: SceneNodeIR[], visit: (n: SceneNodeIR) => void): void {
  for (const item of items) {
    visit(item);
    if (item.kind === "for" || item.kind === "if") walkNodes(item.body, visit);
  }
}

function anyNodeProp(ir: VisualIR, key: string): boolean {
  let hit = false;
  for (const layer of ir.scene.layers) {
    walkNodes(layer.items, (n) => {
      if (n.kind === "node" && n.props[key] !== undefined) hit = true;
    });
  }
  return hit;
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
    const re = compilePattern(pat);
    checks.push({ name: `mustMatch/${pat}`, pass: re.test(source) });
  }
  for (const pat of scenario.assertions.forbidMatch ?? []) {
    const re = compilePattern(pat);
    checks.push({ name: `forbidMatch/${pat}`, pass: !re.test(source) });
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
    if (a.minTicks !== undefined) {
      checks.push({
        name: "ir.minTicks",
        pass: ir.ticks.length >= a.minTicks,
        detail: `ticks=${ir.ticks.length}`,
      });
    }
    if (a.minRules !== undefined) {
      checks.push({
        name: "ir.minRules",
        pass: ir.rules.length >= a.minRules,
        detail: `rules=${ir.rules.length}`,
      });
    }
    if (a.minDataKeys !== undefined) {
      const n = Object.keys(ir.data).length;
      checks.push({
        name: "ir.minDataKeys",
        pass: n >= a.minDataKeys,
        detail: `dataKeys=${n}`,
      });
    }
    if (a.minStateKeys !== undefined) {
      const n = Object.keys(ir.state).length;
      checks.push({
        name: "ir.minStateKeys",
        pass: n >= a.minStateKeys,
        detail: `stateKeys=${n}`,
      });
    }
    if (a.preserveDataKeys) {
      const keys = new Set(Object.keys(ir.data));
      const missing = a.preserveDataKeys.filter((k) => !keys.has(k));
      checks.push({
        name: "ir.preserveDataKeys",
        pass: missing.length === 0,
        detail: missing.length ? `missing=${missing.join(",")}` : "ok",
      });
    }
    if (a.hasSolidProp) {
      checks.push({
        name: "ir.hasSolidProp",
        pass: anyNodeProp(ir, "solid"),
      });
    }
    if (a.hasTimeline) {
      const hit =
        ir.scene.layers.some((l) => l.name.includes("timeline")) ||
        ir.events.some((e) => e.target.includes("timeline"));
      checks.push({
        name: "ir.hasTimeline",
        pass: hit,
        detail: `layers=${ir.scene.layers.map((l) => l.name).join(",")}`,
      });
    }
  }

  if (compiles && ir) {
    const host = createVivaAgentHost();
    const session = host.createSession({
      mount: null,
      handbooks: scenario.handbooks ?? [],
    });
    const result =
      scenario.kind === "patch" || scenario.kind === "multiturn"
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

function buildSystem(scenario: Scenario): string {
  const mode = scenario.system ?? (inferTrack(scenario) === "hard" ? "slim" : "full");
  const parts: string[] = [];
  if (mode === "slim") {
    parts.push(SYSTEM_PROMPT_SLIM);
    // Hard track gets LANGUAGE.md like an agent with repo docs open — not per-task coaching.
    try {
      parts.push(
        "# Language reference\n\n" +
          readFileSync(path.join(root, "docs/LANGUAGE.md"), "utf8"),
      );
    } catch {
      /* optional */
    }
  } else {
    parts.push(SYSTEM_PROMPT);
  }
  const ids = scenario.handbooks ?? [];
  if (ids.length) {
    try {
      const prompt = createNodePromptService();
      for (const id of ids) parts.push(prompt.loadHandbook(id));
    } catch {
      /* ignore missing handbook */
    }
  }
  return parts.join("\n\n---\n\n");
}

function wantsSyntaxCrib(scenario: Scenario): boolean {
  if (scenario.repair?.syntaxCrib !== undefined) return scenario.repair.syntaxCrib;
  return inferTrack(scenario) === "smoke";
}

function repairUserPrompt(
  scenario: Scenario,
  source: string,
  detail: string,
): string {
  const crib = wantsSyntaxCrib(scenario)
    ? `
Syntax reminders:
- Top-level: artifact, data, state, frame NAME, scene, widget chart.*, timeline
- Do NOT nest frame/widget under scene; do NOT write widget: chart.x blocks
`
    : `
Fix using diagnostics and valid Viva. Output ONLY full corrected source starting with artifact.
`;
  return `The following Viva source failed to compile.${crib}

Diagnostics:
${detail}

Broken source:
${source}`;
}

function tryExtract(
  model: string,
  system: string,
  userPrompt: string,
  counter: { n: number },
): { source: string | null; raw: string; error: string } {
  counter.n += 1;
  const res = callPi({ model, system, user: userPrompt });
  if (!res.ok && !res.text.includes("artifact")) {
    return { source: null, raw: res.raw, error: res.raw };
  }
  try {
    return { source: extractVivaSource(res.text), raw: res.raw, error: "" };
  } catch (e) {
    return {
      source: null,
      raw: res.raw,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function maybeRepair(
  scenario: Scenario,
  model: string,
  system: string,
  source: string,
  checks: CaseResult["checks"],
  counter: { n: number },
): { source: string; checks: CaseResult["checks"] } {
  const max = scenario.repair?.maxAttempts ?? 1;
  let cur = source;
  let curChecks = checks;
  let repairs = 0;
  while (repairs < max) {
    const compilePass = curChecks.find((c) => c.name === "compiles")?.pass;
    if (compilePass !== false) break;
    repairs += 1;
    const detail = curChecks.find((c) => c.name === "compiles")?.detail ?? "error";
    const got = tryExtract(model, system, repairUserPrompt(scenario, cur, detail), counter);
    if (got.source?.startsWith("artifact")) {
      cur = got.source;
      curChecks = grade(scenario, cur);
    } else {
      break;
    }
  }
  return { source: cur, checks: curChecks };
}

function runScenario(scenario: Scenario, model: string): CaseResult {
  const track = inferTrack(scenario);
  const seed = scenario.seedSource
    ? readFileSync(path.join(root, scenario.seedSource), "utf8")
    : "";
  let diagnostics = "";
  if ((scenario.kind === "repair" || scenario.seedSource) && seed) {
    const broken = compileSource(seed, path.basename(scenario.seedSource ?? "seed.viva"));
    diagnostics = broken.error ?? (broken.ir ? "" : "compile failed");
  }

  const system = buildSystem(scenario);
  const counter = { n: 0 };
  let source = "";
  let lastRaw = "";
  let lastError = "";

  if (scenario.kind === "multiturn") {
    const turns = scenario.turns ?? [];
    source = seed;
    if (!turns.length) {
      return {
        id: scenario.id,
        title: scenario.title,
        track,
        ok: false,
        attempts: 0,
        error: "multiturn scenario missing turns",
        checks: [{ name: "turns", pass: false }],
      };
    }
    for (const turn of turns) {
      const user = fillTemplate(turn.prompt, { source, diagnostics });
      const got = tryExtract(model, system, user, counter);
      lastRaw = got.raw;
      lastError = got.error;
      if (!got.source?.startsWith("artifact")) {
        return {
          id: scenario.id,
          title: scenario.title,
          track,
          ok: false,
          attempts: counter.n,
          error: lastError || "no artifact in multiturn output",
          source: lastRaw.slice(0, 2000),
          checks: [{ name: "extract", pass: false, detail: lastError }],
        };
      }
      source = got.source;
    }
  } else {
    const user = fillTemplate(scenario.prompt ?? "", { source: seed, diagnostics });
    const got = tryExtract(model, system, user, counter);
    lastRaw = got.raw;
    lastError = got.error;
    source = got.source ?? "";
    if (!source.startsWith("artifact")) {
      return {
        id: scenario.id,
        title: scenario.title,
        track,
        ok: false,
        attempts: counter.n,
        error: lastError || "no artifact in model output",
        source: lastRaw.slice(0, 2000),
        checks: [{ name: "extract", pass: false, detail: lastError }],
      };
    }
  }

  let checks = grade(scenario, source);
  const repaired = maybeRepair(scenario, model, system, source, checks, counter);
  source = repaired.source;
  checks = repaired.checks;

  const ok = checks.every((c) => c.pass);
  return {
    id: scenario.id,
    title: scenario.title,
    track,
    ok,
    attempts: counter.n,
    source,
    diagnostics: checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail ?? "fail"}`),
    checks,
  };
}

function main() {
  const { only, model, track } = parseArgs(process.argv.slice(2));
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error("Missing DEEPSEEK_API_KEY. Export it before running agent exam.");
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });
  const scenarios = loadScenarios(track, only);
  if (!scenarios.length) {
    console.error(`No scenarios matched track=${track} only=${only ?? ""}`);
    process.exit(2);
  }

  console.log(
    `Agent exam: track=${track} model=${model} cases=${scenarios.map((s) => s.id).join(", ")}`,
  );
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
    track,
    model,
    ranAt: new Date().toISOString(),
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => r.ok === false).length,
    results,
  };
  const reportName = track === "hard" ? "report-hard.json" : "report.json";
  writeFileSync(path.join(outDir, reportName), JSON.stringify(report, null, 2));
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nReport: ${path.join(outDir, reportName)}`);
  console.log(`Passed ${report.passed}/${results.length}`);
  process.exit(report.failed ? 1 : 0);
}

main();
