import { spawnSync } from "node:child_process";
import type {
  ModelEndpointConfig,
  TextCompletionRequest,
  TextCompletionResult,
  TextModelClient,
  VisionCompletionRequest,
  VisionCompletionResult,
  VisionModelClient,
  VisionModelResponseJson,
} from "./types.js";

function resolveApiKey(cfg: ModelEndpointConfig): string | undefined {
  if (cfg.apiKey) return cfg.apiKey;
  if (cfg.apiKeyEnv) return process.env[cfg.apiKeyEnv];
  return undefined;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function createTextModelClient(cfg: ModelEndpointConfig): TextModelClient {
  const provider = cfg.provider;
  if (provider === "openai-compatible") {
    return {
      complete: (req) => openAiCompatibleComplete(cfg, req, null),
    };
  }
  if (provider === "pi") {
    return {
      complete: (req) => piComplete(cfg, req, null),
    };
  }
  if (provider === "http") {
    return {
      complete: (req) => httpComplete(cfg, req, null),
    };
  }
  throw new Error(`unsupported text provider: ${provider}`);
}

export function createVisionModelClient(cfg: ModelEndpointConfig): VisionModelClient {
  const provider = cfg.provider;
  if (provider === "openai-compatible") {
    return {
      completeVision: (req) => openAiCompatibleComplete(cfg, req, req.imagePng),
    };
  }
  if (provider === "pi") {
    return {
      completeVision: (req) => piComplete(cfg, req, req.imagePng),
    };
  }
  if (provider === "http") {
    return {
      completeVision: (req) => httpComplete(cfg, req, req.imagePng),
    };
  }
  throw new Error(`unsupported vision provider: ${provider}`);
}

async function openAiCompatibleComplete(
  cfg: ModelEndpointConfig,
  req: TextCompletionRequest,
  imagePng: Uint8Array | null,
): Promise<TextCompletionResult> {
  const apiKey = resolveApiKey(cfg);
  if (!apiKey) {
    throw new Error(
      `missing API key for model '${cfg.model}' (set ${cfg.apiKeyEnv ?? "apiKey"})`,
    );
  }
  const baseUrl = normalizeBaseUrl(cfg.baseUrl ?? "https://api.openai.com");
  const userContent: unknown =
    imagePng
      ? [
          { type: "text", text: req.user },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${Buffer.from(imagePng).toString("base64")}`,
            },
          },
        ]
      : req.user;

  const body = {
    model: cfg.model,
    temperature: cfg.extra?.temperature ?? 0.2,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: userContent },
    ],
    ...cfg.extra,
  };

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`vision API ${res.status}: ${raw.slice(0, 400)}`);
  }
  const json = JSON.parse(raw) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("vision API returned empty content");
  return { text, raw: json };
}

async function httpComplete(
  cfg: ModelEndpointConfig,
  req: TextCompletionRequest,
  imagePng: Uint8Array | null,
): Promise<TextCompletionResult> {
  if (!cfg.httpUrl) throw new Error("http provider requires httpUrl");
  const payload = {
    kind: imagePng ? "vision-check" : "text-complete",
    model: cfg.model,
    system: req.system,
    user: req.user,
    image: imagePng
      ? { format: "png", base64: Buffer.from(imagePng).toString("base64") }
      : undefined,
    extra: cfg.extra,
  };
  const headers: Record<string, string> = { "content-type": "application/json" };
  const apiKey = resolveApiKey(cfg);
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const res = await fetch(cfg.httpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const rawText = await res.text();
  if (!res.ok) throw new Error(`http model ${res.status}: ${rawText.slice(0, 400)}`);
  const json = JSON.parse(rawText) as {
    text?: string;
    content?: string;
    ok?: boolean;
    issues?: VisionModelResponseJson["issues"];
  };
  if (json.issues) {
    return {
      text: JSON.stringify({ ok: json.ok ?? json.issues.length === 0, issues: json.issues }),
      raw: json,
    };
  }
  const text = (json.text ?? json.content ?? rawText).trim();
  return { text, raw: json };
}

async function piComplete(
  cfg: ModelEndpointConfig,
  req: TextCompletionRequest,
  imagePng: Uint8Array | null,
): Promise<TextCompletionResult> {
  if (imagePng) {
    throw new Error(
      "pi provider does not accept images in this build; use openai-compatible or http for vision",
    );
  }
  const apiKey = resolveApiKey(cfg);
  if (!apiKey) {
    throw new Error(`missing API key for pi (set ${cfg.apiKeyEnv ?? "DEEPSEEK_API_KEY"})`);
  }
  const piBin = cfg.piBin ?? process.env.PI_BIN ?? "pi";
  const args = [
    "-p",
    "--provider",
    cfg.piProvider ?? "deepseek",
    "--model",
    cfg.model,
    "--api-key",
    apiKey,
    "--thinking",
    String(cfg.extra?.thinking ?? "low"),
    "--no-tools",
    "--no-session",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-context-files",
    "--no-themes",
    "--system-prompt",
    req.system,
    req.user,
  ];
  const res = spawnSync(piBin, args, {
    encoding: "utf8",
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
    timeout: Number(cfg.extra?.timeoutMs ?? 180_000),
  });
  const raw = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim();
  if (res.error) throw new Error(String(res.error));
  if (res.status !== 0 && !raw) throw new Error(`pi exited ${res.status}: ${raw}`);
  return { text: raw, raw };
}
