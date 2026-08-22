/** System prompt for multimodal figure QA — response must be JSON only. */

export const VISION_CHECK_SYSTEM = `You are a scientific figure QA assistant for the Viva artifact language.
You receive a rasterized screenshot of a compiled figure (not the Playground chrome).
Judge publication readiness: layout, readability, color, missing panels, obvious data-visual bugs.

Respond with ONLY a JSON object (no markdown fences), schema:
{
  "ok": boolean,
  "issues": [
    {
      "severity": "error" | "warn" | "info",
      "code": "short_snake_code",
      "message": "what is wrong",
      "hint": "how to fix in Viva source"
    }
  ]
}

Focus on user-visible defects: blank heatmaps, overlapping bars, drifted vector fields, wrong panel labels, unreadable text.
Ignore minor aesthetic taste unless it hurts readability. Empty issues array when ok is true.`;

export function buildVisionCheckUserPrompt(opts: {
  artifactName: string;
  sourceSnippet?: string;
  structuralSummary?: string;
  inkRatio?: number;
  colorCount?: number;
}): string {
  const parts = [
    `Artifact name: ${opts.artifactName}`,
  ];
  if (opts.inkRatio !== undefined) {
    parts.push(`Raster ink ratio: ${(opts.inkRatio * 100).toFixed(2)}%`);
  }
  if (opts.colorCount !== undefined) {
    parts.push(`Quantized color count: ${opts.colorCount}`);
  }
  if (opts.structuralSummary) {
    parts.push(`Structural checks already reported:\n${opts.structuralSummary}`);
  }
  if (opts.sourceSnippet) {
    const snippet = opts.sourceSnippet.length > 4000
      ? `${opts.sourceSnippet.slice(0, 4000)}\n…`
      : opts.sourceSnippet;
    parts.push(`Viva source (truncated):\n${snippet}`);
  }
  parts.push("Inspect the attached image and return JSON only.");
  return parts.join("\n\n");
}
