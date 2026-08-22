import type { VisualIR } from "../ir.js";
import type { CheckDiagnostic, CheckOptions } from "./types.js";
import { rasterizeIr } from "./raster.js";
import { VISION_CHECK_SYSTEM, buildVisionCheckUserPrompt } from "./vision-prompt.js";
import {
  createVisionModelClient,
  resolveModelsConfig,
  type VisionIssueJson,
  type VisionModelClient,
  type VisionModelResponseJson,
} from "./models/index.js";

function push(
  out: CheckDiagnostic[],
  code: string,
  message: string,
  severity: CheckDiagnostic["severity"],
  hint?: string,
): void {
  out.push({
    code,
    message,
    severity,
    layer: "vision",
    span: { line: 1, column: 1 },
    hint,
  });
}

function extractJson(text: string): VisionModelResponseJson {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as VisionModelResponseJson;
  } catch {
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
    if (fence) return JSON.parse(fence[1]!.trim()) as VisionModelResponseJson;
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as VisionModelResponseJson;
    }
    throw new Error("vision model did not return JSON");
  }
}

function mapIssue(issue: VisionIssueJson, index: number): CheckDiagnostic {
  const severity =
    issue.severity === "error" || issue.severity === "warn" || issue.severity === "info"
      ? issue.severity === "info"
        ? "warn"
        : issue.severity
      : "warn";
  return {
    code: issue.code ? `check.vision.${issue.code}` : `check.vision.issue_${index}`,
    message: issue.message,
    severity,
    layer: "vision",
    span: { line: 1, column: 1 },
    hint: issue.hint,
  };
}

function resolveVisionClient(opts: CheckOptions): VisionModelClient | null {
  if (opts.visionClient) return opts.visionClient;
  const slots = resolveModelsConfig(opts.modelsConfigPath);
  const cfg = slots.vision;
  if (!cfg) return null;
  return createVisionModelClient(cfg);
}

export async function runVisionChecks(
  ir: VisualIR,
  opts: CheckOptions = {},
  structural?: CheckDiagnostic[],
  rasterStats?: { inkRatio?: number; colorCount?: number },
): Promise<CheckDiagnostic[]> {
  const out: CheckDiagnostic[] = [];
  const client = resolveVisionClient(opts);
  if (!client) {
    push(
      out,
      "check.vision.unconfigured",
      "no vision/multimodal model configured (viva.models.json or VIVA_VISION_* env)",
      "error",
      "Add vision slot in viva.models.json or pass visionClient in code.",
    );
    return out;
  }

  const raster = await rasterizeIr(ir, opts);
  const structuralSummary =
    structural
      ?.filter((d) => d.severity !== "info")
      .map((d) => `- [${d.severity}] ${d.code}: ${d.message}`)
      .join("\n") ?? "";

  const user = buildVisionCheckUserPrompt({
    artifactName: ir.name,
    sourceSnippet: opts.source,
    structuralSummary: structuralSummary || undefined,
    inkRatio: rasterStats?.inkRatio,
    colorCount: rasterStats?.colorCount,
  });

  try {
    const slots = resolveModelsConfig(opts.modelsConfigPath);
    const model = slots.vision?.model ?? "vision";
    const result = await client.completeVision({
      model,
      system: VISION_CHECK_SYSTEM,
      user,
      imagePng: raster.png,
      artifactName: ir.name,
    });
    const parsed = extractJson(result.text);
    if (parsed.issues?.length) {
      for (let i = 0; i < parsed.issues.length; i++) {
        out.push(mapIssue(parsed.issues[i]!, i));
      }
    } else if (parsed.ok === false) {
      push(out, "check.vision.failed", "vision model reported ok=false with no issues", "warn");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    push(out, "check.vision.api", `vision check failed: ${message}`, "error");
  }

  return out;
}
