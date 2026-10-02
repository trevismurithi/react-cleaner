import fs from "fs";
import path from "path";
import type { ConsoleLogPatternsConfig, QleanerConfig } from "../types";
import { matchesHighRiskConsoleArgText } from "./consoleLogHighRiskPatterns";
import { matchesMediumRiskConsoleArgText } from "./consoleLogMediumRiskPatterns";

export const DEFAULT_CONSOLE_LOG_PATTERNS: ConsoleLogPatternsConfig = {
  high: [],
  medium: [],
  ignore: [],
};

const MAX_PATTERN_LENGTH = 200;

export interface CompiledConsoleLogPatterns {
  high: RegExp[];
  medium: RegExp[];
  ignore: RegExp[];
  raw: ConsoleLogPatternsConfig;
  invalid: string[];
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeConsoleLogPatterns(
  value: unknown
): ConsoleLogPatternsConfig {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_CONSOLE_LOG_PATTERNS };
  }
  const row = value as Record<string, unknown>;
  return {
    high: asStringList(row.high),
    medium: asStringList(row.medium),
    ignore: asStringList(row.ignore),
  };
}

function compilePattern(source: string, invalid: string[]): RegExp | null {
  if (source.length > MAX_PATTERN_LENGTH) {
    invalid.push(source);
    return null;
  }
  try {
    return new RegExp(source, "i");
  } catch {
    invalid.push(source);
    return null;
  }
}

export function compileConsoleLogPatterns(
  raw: ConsoleLogPatternsConfig
): CompiledConsoleLogPatterns {
  const invalid: string[] = [];
  const compileAll = (patterns: string[]): RegExp[] =>
    patterns
      .map((pattern) => compilePattern(pattern, invalid))
      .filter((pattern): pattern is RegExp => pattern != null);

  return {
    high: compileAll(raw.high),
    medium: compileAll(raw.medium),
    ignore: compileAll(raw.ignore),
    raw,
    invalid,
  };
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

let cachedPatterns: CompiledConsoleLogPatterns | null = null;

export function loadProjectConsoleLogPatterns(): CompiledConsoleLogPatterns {
  if (cachedPatterns) {
    return cachedPatterns;
  }
  const config = readProjectConfig();
  cachedPatterns = compileConsoleLogPatterns(
    normalizeConsoleLogPatterns(config?.consoleLogPatterns),
  );
  return cachedPatterns;
}

function anyMatch(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Classification order: ignore → custom high → builtin high → custom medium → builtin medium → low.
 * Ignore overrides sensitive tiers and counts as low (still removable, not sensitive).
 */
export function classifyConsoleArgRisk(
  text: unknown
): "high" | "medium" | "low" {
  const s = text == null ? "" : String(text);
  if (!s.trim()) {
    return "low";
  }
  const custom = loadProjectConsoleLogPatterns();
  if (anyMatch(custom.ignore, s)) {
    return "low";
  }
  if (anyMatch(custom.high, s) || matchesHighRiskConsoleArgText(s)) {
    return "high";
  }
  if (anyMatch(custom.medium, s) || matchesMediumRiskConsoleArgText(s)) {
    return "medium";
  }
  return "low";
}
