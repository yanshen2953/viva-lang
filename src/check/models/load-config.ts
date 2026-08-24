import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ModelEndpointConfig, ResolvedModelSlots, VivaModelsFile } from "./types.js";

const SEARCH_PATHS = [
  process.env.VIVA_MODELS_CONFIG,
  "viva.models.json",
  ".viva/models.json",
  path.join(process.env.HOME ?? "", ".viva/models.json"),
].filter(Boolean) as string[];

function mergeSlot(
  file: VivaModelsFile,
  slot: "base" | "vision",
): ModelEndpointConfig | null {
  if (file[slot]) return file[slot]!;
  if (file.multimodal) return file.multimodal;
  return null;
}

function envOverride(slot: "base" | "vision"): ModelEndpointConfig | null {
  const prefix = slot === "base" ? "VIVA_BASE" : "VIVA_VISION";
  const model = process.env[`${prefix}_MODEL`];
  if (!model) return null;
  const provider = (process.env[`${prefix}_PROVIDER`] ?? "openai-compatible") as ModelEndpointConfig["provider"];
  return {
    provider,
    model,
    baseUrl: process.env[`${prefix}_BASE_URL`],
    apiKeyEnv: process.env[`${prefix}_API_KEY_ENV`] ?? (slot === "vision" ? "VIVA_VISION_API_KEY" : "VIVA_BASE_API_KEY"),
    httpUrl: process.env[`${prefix}_HTTP_URL`],
    piProvider: process.env[`${prefix}_PI_PROVIDER`],
  };
}

export function resolveModelsConfig(explicitPath?: string): ResolvedModelSlots {
  let configPath: string | undefined;
  let file: VivaModelsFile = {};

  const candidates = explicitPath ? [explicitPath] : SEARCH_PATHS;
  for (const p of candidates) {
    const resolved = path.isAbsolute(p) ? p : path.resolve(p);
    if (!existsSync(resolved)) continue;
    try {
      file = JSON.parse(readFileSync(resolved, "utf8")) as VivaModelsFile;
      configPath = resolved;
      break;
    } catch {
      /* try next */
    }
  }

  const base = envOverride("base") ?? mergeSlot(file, "base");
  const vision = envOverride("vision") ?? mergeSlot(file, "vision");

  return { base, vision, configPath };
}

export function maskModelConfig(cfg: ModelEndpointConfig): ModelEndpointConfig {
  return {
    ...cfg,
    apiKey: cfg.apiKey ? "***" : undefined,
  };
}

export function describeModelSlots(slots: ResolvedModelSlots): Record<string, unknown> {
  return {
    configPath: slots.configPath ?? null,
    base: slots.base ? maskModelConfig(slots.base) : null,
    vision: slots.vision ? maskModelConfig(slots.vision) : null,
  };
}
