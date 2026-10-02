import type { ChalkInstance } from "../../types";
import {
  chatJson,
  AiUnreachableError,
  AiJsonError,
  AiAuthError,
} from "./client";
import { resolveAiSettings } from "./config";
import { chunkList } from "./pack";
import { getReporter, printGenericBrief } from "./reporters";
import type {
  AiCommandId,
  AiEnvelope,
  AiRunOptions,
  AiScanItem,
  AiScanKind,
} from "./types";

const LOCAL_SCAN_BATCH = 40;
const CLOUD_SCAN_BATCH = 150;
const CLOUD_MAX_TOKENS = 4096;

function isEnvelope(value: unknown): value is AiEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as AiEnvelope;
  return row.result != null && typeof row.result === "object";
}

function skipMessage(chalk: ChalkInstance, reason: string): void {
  console.log(chalk.gray(`AI brief skipped (${reason}).`));
}

function asScanKind(value: unknown): AiScanKind | null {
  return value === "asset" || value === "code" ? value : null;
}

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(n)));
}

function extractScanItems(result: unknown): AiScanItem[] {
  if (!result || typeof result !== "object") {
    return [];
  }
  const items = (result as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }
  const out: AiScanItem[] = [];
  for (const row of items) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const item = row as { id?: unknown; kind?: unknown; score?: unknown };
    const id = typeof item.id === "string" ? item.id : String(item.id ?? "");
    const kind = asScanKind(item.kind);
    if (!id || !kind) {
      continue;
    }
    out.push({ id, kind, score: clampScore(item.score) });
  }
  return out;
}

function stringifyWarning(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value == null) {
    return "";
  }
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    for (const key of ["message", "warning", "text", "why", "detail"]) {
      if (typeof row[key] === "string" && row[key].trim()) {
        return row[key].trim();
      }
    }
    try {
      const json = JSON.stringify(value);
      return json && json !== "{}" ? json : "";
    } catch {
      return "";
    }
  }
  return String(value).trim();
}

function toEnvelope(
  command: AiCommandId,
  parsed: AiEnvelope,
  result = parsed.result
): AiEnvelope {
  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.map(stringifyWarning).filter(Boolean)
    : [];
  return {
    command: parsed.command || command,
    headline: typeof parsed.headline === "string" ? parsed.headline : "",
    warnings,
    nextCommand:
      typeof parsed.nextCommand === "string" ? parsed.nextCommand : undefined,
    result,
  };
}

function filesFromPack(
  pack: unknown
): Array<{ id: string; file: string }> {
  if (!pack || typeof pack !== "object") {
    return [];
  }
  const files = (pack as { files?: unknown }).files;
  if (!Array.isArray(files)) {
    return [];
  }
  return files.filter(
    (row): row is { id: string; file: string } =>
      Boolean(row) &&
      typeof row === "object" &&
      typeof (row as { id?: unknown }).id === "string" &&
      typeof (row as { file?: unknown }).file === "string",
  );
}

function isSkippableAiError(error: unknown): boolean {
  return (
    error instanceof AiUnreachableError ||
    error instanceof AiJsonError ||
    error instanceof AiAuthError
  );
}

function chatOptions(
  settings: ReturnType<typeof resolveAiSettings>,
  numPredict?: number
): { numPredict?: number; maxTokens?: number } {
  if (settings.profile === "cloud") {
    return { maxTokens: CLOUD_MAX_TOKENS, numPredict };
  }
  return { numPredict };
}

async function explainScanBatched(
  command: AiCommandId,
  pack: Record<string, unknown>,
  files: Array<{ id: string; file: string }>,
  settings: ReturnType<typeof resolveAiSettings>,
  reporter: ReturnType<typeof getReporter>,
  chalk: ChalkInstance
): Promise<void> {
  const batchSize =
    settings.profile === "cloud"
      ? CLOUD_SCAN_BATCH
      : reporter.batchSize || LOCAL_SCAN_BATCH;
  const chunks = chunkList(files, batchSize);
  const merged: AiScanItem[] = [];
  const seen = new Set<string>();
  let lastParsed: AiEnvelope | null = null;

  for (let i = 0; i < chunks.length; i++) {
    const user = JSON.stringify({
      command,
      domain: settings.domain,
      ask: settings.ask,
      findings: {
        ...pack,
        files: chunks[i],
        batch: i + 1,
        batches: chunks.length,
      },
    });
    try {
      const parsed = await chatJson(
        settings,
        reporter.system,
        user,
        chatOptions(settings, reporter.numPredict),
      );
      if (!isEnvelope(parsed)) {
        continue;
      }
      lastParsed = parsed;
      for (const item of extractScanItems(parsed.result)) {
        if (seen.has(item.id)) {
          continue;
        }
        seen.add(item.id);
        merged.push(item);
      }
    } catch (error) {
      if (isSkippableAiError(error)) {
        skipMessage(chalk, (error as Error).message);
        break;
      }
      const err = error instanceof Error ? error : new Error(String(error));
      skipMessage(chalk, err.message);
      break;
    }
  }

  if (!lastParsed && merged.length === 0) {
    skipMessage(chalk, "model returned invalid JSON");
    return;
  }

  const envelope = toEnvelope(
    command,
    lastParsed || {
      command,
      headline: "",
      warnings: [],
      result: { items: merged },
    },
    { items: merged },
  );
  const render = reporter.render || printGenericBrief;
  render(chalk, envelope, pack, `${settings.profile} · ${settings.model}`);
}

export async function maybeExplain(
  command: AiCommandId,
  findings: unknown,
  options: AiRunOptions,
  chalk: ChalkInstance
): Promise<void> {
  const settings = resolveAiSettings(options);
  if (!settings.enabled) {
    return;
  }

  if (settings.provider === "openai" && !settings.apiKey) {
    skipMessage(chalk, "set QLEANER_AI_API_KEY or OPENAI_API_KEY");
    return;
  }

  const reporter = getReporter(command);
  if (reporter.requiresDomain && !settings.domain) {
    skipMessage(chalk, "pass --domain to re-rank prune-logs");
    return;
  }

  const pack = reporter.buildPack(findings, {
    domain: settings.domain,
    ask: settings.ask,
    maxCandidates: settings.maxCandidates,
  }) as Record<string, unknown>;

  const files = command === "scan" ? filesFromPack(pack) : [];

  console.log(
    chalk.gray(
      `AI brief: waiting on ${settings.model} (${settings.profile})…`,
    ),
  );

  if (command === "scan" && files.length > 0) {
    await explainScanBatched(
      command,
      pack,
      files,
      settings,
      reporter,
      chalk,
    );
    return;
  }

  const user = JSON.stringify({
    command,
    domain: settings.domain,
    ask: settings.ask,
    findings: pack,
  });

  let parsed: unknown;
  try {
    parsed = await chatJson(
      settings,
      reporter.system,
      user,
      chatOptions(settings, reporter.numPredict),
    );
  } catch (error) {
    if (isSkippableAiError(error)) {
      skipMessage(chalk, (error as Error).message);
      return;
    }
    const err = error instanceof Error ? error : new Error(String(error));
    skipMessage(chalk, err.message);
    return;
  }

  if (!isEnvelope(parsed)) {
    skipMessage(chalk, "model returned invalid JSON");
    return;
  }

  const render = reporter.render || printGenericBrief;
  render(
    chalk,
    toEnvelope(command, parsed),
    pack,
    `${settings.profile} · ${settings.model}`,
  );
}
