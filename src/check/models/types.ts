/** Pluggable model endpoints for text + multimodal artifact checks. */

export type ModelProviderKind = "openai-compatible" | "pi" | "http";

export type ModelEndpointConfig = {
  provider: ModelProviderKind;
  model: string;
  /** OpenAI-compatible API root, e.g. https://api.deepseek.com */
  baseUrl?: string;
  /** Read API key from process.env[name] */
  apiKeyEnv?: string;
  /** Inline key (tests / local only — do not commit) */
  apiKey?: string;
  /** Pi CLI --provider (default deepseek) */
  piProvider?: string;
  /** Pi binary (default PI_BIN or pi) */
  piBin?: string;
  /**
   * Custom multimodal HTTP entry.
   * POST JSON: { kind, model, system, user, image: { format, base64 } }
   * Response: { text?: string, issues?: VisionIssueJson[] }
   */
  httpUrl?: string;
  /** Extra fields forwarded to provider (temperature, thinking, etc.) */
  extra?: Record<string, unknown>;
};

export type VivaModelsFile = {
  /** Text model for compile/repair agents (optional). */
  base?: ModelEndpointConfig;
  /** Multimodal model dedicated to screenshot QA. */
  vision?: ModelEndpointConfig;
  /** Single multimodal model used when base/vision not set separately. */
  multimodal?: ModelEndpointConfig;
};

export type ResolvedModelSlots = {
  base: ModelEndpointConfig | null;
  vision: ModelEndpointConfig | null;
  configPath?: string;
};

export type VisionIssueJson = {
  severity?: "warn" | "error" | "info";
  code?: string;
  message: string;
  hint?: string;
};

export type VisionModelResponseJson = {
  ok?: boolean;
  issues?: VisionIssueJson[];
};

export type TextCompletionRequest = {
  model: string;
  system: string;
  user: string;
};

export type TextCompletionResult = {
  text: string;
  raw?: unknown;
};

export type VisionCompletionRequest = TextCompletionRequest & {
  imagePng: Uint8Array;
  artifactName?: string;
};

export type VisionCompletionResult = TextCompletionResult;

/** Text-only LLM client (base model slot). */
export type TextModelClient = {
  complete(req: TextCompletionRequest): Promise<TextCompletionResult>;
};

/** Multimodal client — screenshot + prompt in, structured text out. */
export type VisionModelClient = {
  completeVision(req: VisionCompletionRequest): Promise<VisionCompletionResult>;
};
