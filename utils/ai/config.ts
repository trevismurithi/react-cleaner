import fs from "fs";
import path from "path";
import type { QleanerAiConfig, QleanerConfig } from "../../types";
import type { AiRunOptions } from "./types";

export const DEFAULT_AI_CONFIG: QleanerAiConfig = {
  enabled: false,
  provider: "ollama",
  endpoint: "http://127.0.0.1:11434",
  model: "qwen2.5-coder:7b",
  maxCandidates: 12,
};

const OLLAMA_LOOPBACK = "http://127.0.0.1:11434";
const OPENAI_DEFAULT_ENDPOINT = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MODEL = "gpt-4.1-mini";

export interface ResolvedAiSettings {
  enabled: boolean;
  provider: "ollama" | "openai";
  profile: "local" | "cloud";
  endpoint: string;
  model: string;
  apiKey: string | null;
  maxCandidates: number;
  domain: string | null;
  ask: string | null;
}

function readProjectConfig(): QleanerConfig | null {
  const configPath = path.join(process.cwd(), "qleaner.config.json");
  if (!fs.existsSync(configPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as QleanerConfig;
  } catch {
    return null;
  }
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asProvider(value: unknown): "ollama" | "openai" {
  return value === "openai" ? "openai" : "ollama";
}

export function resolveAiSettings(options: AiRunOptions = {}): ResolvedAiSettings {
  const config = readProjectConfig();
  const ai = { ...DEFAULT_AI_CONFIG, ...(config?.ai || {}) };
  const envProvider = trimOrNull(process.env.QLEANER_AI_PROVIDER);
  const envEndpoint = trimOrNull(process.env.QLEANER_AI_ENDPOINT);
  const envModel = trimOrNull(process.env.QLEANER_AI_MODEL);
  const apiKey =
    trimOrNull(process.env.QLEANER_AI_API_KEY) ||
    trimOrNull(process.env.OPENAI_API_KEY);

  const explainFlag = options.explain === true;
  const configEnabled = ai.enabled === true;
  const enabled =
    options.quiet !== true &&
    options.explain !== false &&
    (explainFlag || configEnabled);

  const provider = asProvider(envProvider || ai.provider);
  let endpoint = envEndpoint || ai.endpoint || DEFAULT_AI_CONFIG.endpoint;
  let model = envModel || ai.model || DEFAULT_AI_CONFIG.model;

  if (provider === "openai") {
    const normalized = endpoint.replace(/\/$/, "");
    if (!normalized || normalized === OLLAMA_LOOPBACK) {
      endpoint = OPENAI_DEFAULT_ENDPOINT;
    }
    if (model === DEFAULT_AI_CONFIG.model) {
      model = OPENAI_DEFAULT_MODEL;
    }
  }

  const profile: "local" | "cloud" =
    ai.profile === "local" || ai.profile === "cloud"
      ? ai.profile
      : provider === "ollama"
        ? "local"
        : "cloud";

  return {
    enabled,
    provider,
    profile,
    endpoint,
    model,
    apiKey,
    maxCandidates:
      Number.isFinite(ai.maxCandidates) && ai.maxCandidates > 0
        ? ai.maxCandidates
        : DEFAULT_AI_CONFIG.maxCandidates,
    domain: trimOrNull(options.domain) || trimOrNull(config?.domain) || null,
    ask: trimOrNull(options.ask),
  };
}

export function isAiEnabled(options: AiRunOptions = {}): boolean {
  return resolveAiSettings(options).enabled;
}
