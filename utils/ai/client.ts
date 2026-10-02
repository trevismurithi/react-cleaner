import type { ResolvedAiSettings } from "./config";

interface OllamaChatResponse {
  message?: { content?: string };
  response?: string;
  error?: string;
  done?: boolean;
}

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fence ? fence[1].trim() : trimmed;
}

function extractJsonObject(text: string): string {
  const stripped = stripJsonFence(text);
  const start = stripped.indexOf("{");
  if (start < 0) {
    return stripped;
  }
  return stripped.slice(start);
}

function closeOpenJson(text: string): string {
  let s = text.trim().replace(/,(\s*[}\]])/g, "$1");
  let inString = false;
  let escape = false;
  const stack: Array<"{" | "["> = [];
  for (const ch of s) {
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      stack.push("{");
    } else if (ch === "[") {
      stack.push("[");
    } else if (ch === "}" || ch === "]") {
      stack.pop();
    }
  }
  if (inString) {
    s += '"';
  }
  s = s.replace(/,\s*$/, "");
  while (stack.length > 0) {
    s += stack.pop() === "{" ? "}" : "]";
  }
  return s.replace(/,(\s*[}\]])/g, "$1");
}

function insertMissingCommas(text: string): string {
  return text.replace(/}\s*{/g, "},{").replace(/]\s*\[/g, "],[");
}

function parseModelJson(raw: string): unknown {
  const extracted = extractJsonObject(raw);
  const candidates = [
    extracted,
    insertMissingCommas(extracted),
    closeOpenJson(extracted),
    closeOpenJson(insertMissingCommas(extracted)),
  ];
  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError || new AiJsonError();
}

export class AiJsonError extends Error {
  override name = "AiJsonError";
  constructor() {
    super("model returned invalid JSON");
  }
}

export class AiAuthError extends Error {
  override name = "AiAuthError";
  constructor() {
    super("AI provider rejected the API key (HTTP 401/403) — check QLEANER_AI_API_KEY or OPENAI_API_KEY");
  }
}

export class AiUnreachableError extends Error {
  override name = "AiUnreachableError";
  constructor(endpoint: string, cause?: unknown) {
    const detail = cause instanceof Error ? cause.message : "";
    super(
      detail
        ? `AI endpoint not reachable at ${endpoint} (${detail})`
        : `AI endpoint not reachable at ${endpoint}`,
    );
  }
}

function isUnreachable(error: unknown): boolean {
  if (error instanceof AiUnreachableError) {
    return true;
  }
  if (!error || typeof error !== "object") {
    return false;
  }
  const err = error as { name?: string; message?: string; cause?: unknown };
  const blob = `${err.name || ""} ${err.message || ""} ${String(err.cause || "")}`;
  return /ECONNREFUSED|ENOTFOUND|ECONNRESET|fetch failed/i.test(blob);
}

async function readNdjsonContent(
  body: ReadableStream<Uint8Array>
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        const chunk = JSON.parse(trimmed) as OllamaChatResponse;
        if (typeof chunk.error === "string" && chunk.error) {
          throw new Error(chunk.error);
        }
        content += chunk.message?.content ?? chunk.response ?? "";
        if (chunk.done) {
          return content;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (buffer.trim()) {
    const chunk = JSON.parse(buffer.trim()) as OllamaChatResponse;
    content += chunk.message?.content ?? chunk.response ?? "";
  }
  return content;
}

function httpErrorDetail(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }
  const row = body as { error?: unknown };
  if (typeof row.error === "string" && row.error) {
    return `: ${row.error}`;
  }
  if (row.error && typeof row.error === "object") {
    const message = (row.error as { message?: unknown }).message;
    if (typeof message === "string" && message) {
      return `: ${message}`;
    }
  }
  return "";
}

async function chatOllama(
  settings: ResolvedAiSettings,
  system: string,
  user: string,
  numPredict: number
): Promise<unknown> {
  const url = `${settings.endpoint.replace(/\/$/, "")}/api/chat`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: settings.model,
        stream: true,
        keep_alive: "10m",
        options: {
          temperature: 0,
          num_ctx: 2048,
          num_predict: numPredict,
        },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (error) {
    if (isUnreachable(error)) {
      throw new AiUnreachableError(settings.endpoint, error);
    }
    throw error;
  }

  if (!response.ok) {
    let detail = "";
    try {
      detail = httpErrorDetail(await response.json());
    } catch {
      // ignore body parse
    }
    if (response.status === 500) {
      throw new Error(
        `Ollama HTTP 500${detail} (often an overloaded run; retry)`,
      );
    }
    throw new Error(`Ollama HTTP ${response.status}${detail}`);
  }

  if (!response.body) {
    throw new Error("Ollama returned an empty body");
  }

  const raw = await readNdjsonContent(response.body);
  if (!raw.trim()) {
    throw new Error("Ollama returned an empty response");
  }
  return parseModelJson(raw);
}

function chatCompletionsUrl(endpoint: string): string {
  const base = endpoint.replace(/\/$/, "");
  if (base.endsWith("/chat/completions")) {
    return base;
  }
  return `${base}/chat/completions`;
}

async function chatOpenAi(
  settings: ResolvedAiSettings,
  system: string,
  user: string,
  maxTokens: number
): Promise<unknown> {
  const url = chatCompletionsUrl(settings.endpoint);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: settings.model,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (error) {
    if (isUnreachable(error)) {
      throw new AiUnreachableError(settings.endpoint, error);
    }
    throw error;
  }

  let body: OpenAiChatResponse | null = null;
  try {
    body = (await response.json()) as OpenAiChatResponse;
  } catch {
    body = null;
  }

  if (response.status === 401 || response.status === 403) {
    throw new AiAuthError();
  }
  if (!response.ok) {
    throw new Error(
      `AI HTTP ${response.status}${httpErrorDetail(body)}`,
    );
  }

  const raw = body?.choices?.[0]?.message?.content;
  if (!raw || !raw.trim()) {
    throw new Error("AI provider returned an empty response");
  }
  return parseModelJson(raw);
}

export async function chatJson(
  settings: ResolvedAiSettings,
  system: string,
  user: string,
  options: { numPredict?: number; maxTokens?: number } = {}
): Promise<unknown> {
  const numPredict =
    Number.isFinite(options.numPredict) && (options.numPredict as number) > 0
      ? Math.floor(options.numPredict as number)
      : 512;
  const maxTokens =
    Number.isFinite(options.maxTokens) && (options.maxTokens as number) > 0
      ? Math.floor(options.maxTokens as number)
      : settings.profile === "cloud"
        ? 4096
        : numPredict;

  try {
    if (settings.provider === "openai") {
      return await chatOpenAi(settings, system, user, maxTokens);
    }
    return await chatOllama(settings, system, user, numPredict);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new AiJsonError();
    }
    throw error;
  }
}
