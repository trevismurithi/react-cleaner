import type { FlattenedLogHit } from "./types";

export const PREVIEW_MAX_LEN = 90;

export function truncatePreview(text: unknown, maxLen = PREVIEW_MAX_LEN): string {
  const s = String(text == null ? "" : text)
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= maxLen) {
    return s;
  }
  return `${s.slice(0, maxLen)}…`;
}

export function capList<T>(items: T[] | undefined | null, max: number): T[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }
  if (!Number.isFinite(max) || max < 0) {
    return items.slice();
  }
  return items.slice(0, Math.max(0, max));
}

export function relativeOrRaw(filePath: unknown): string {
  if (typeof filePath !== "string" || !filePath) {
    return "";
  }
  const cwd = process.cwd();
  if (filePath.startsWith(cwd)) {
    const rel = filePath.slice(cwd.length).replace(/^[/\\]/, "");
    return rel || filePath;
  }
  return filePath;
}

/** Last path segments only — keeps Ollama prompts small. */
export function shortRelPath(filePath: unknown, maxLen = 56): string {
  const rel = relativeOrRaw(filePath).replace(/\\/g, "/");
  if (!rel) {
    return "";
  }
  if (rel.length <= maxLen) {
    return rel;
  }
  const parts = rel.split("/").filter(Boolean);
  const tail = parts.slice(-3).join("/");
  if (tail.length <= maxLen) {
    return `…/${tail}`;
  }
  return truncatePreview(tail, maxLen);
}

export function numberedUnusedPaths(
  files: unknown
): Array<{ id: string; file: string }> {
  const list = Array.isArray(files)
    ? files
    : files instanceof Set
      ? Array.from(files)
      : [];
  return list.map((entry, index) => {
    const file =
      typeof entry === "string"
        ? entry
        : (entry as { file?: string }).file;
    return {
      id: String(index + 1),
      file: shortRelPath(file),
    };
  });
}

export function flattenFoundByRisk(
  foundByRisk: unknown,
  maxCandidates = Number.POSITIVE_INFINITY
): FlattenedLogHit[] {
  if (!foundByRisk || typeof foundByRisk !== "object") {
    return [];
  }
  const buckets = foundByRisk as {
    high?: Array<{ file?: string; line?: number; preview?: string }>;
    medium?: Array<{ file?: string; line?: number; preview?: string }>;
    low?: Array<{ file?: string; line?: number; preview?: string }>;
  };
  const hits: FlattenedLogHit[] = [];
  let id = 1;
  for (const risk of ["high", "medium", "low"] as const) {
    const rows = buckets[risk];
    if (!Array.isArray(rows)) {
      continue;
    }
    for (const row of rows) {
      hits.push({
        id: String(id++),
        file: shortRelPath(row.file),
        line: typeof row.line === "number" ? row.line : undefined,
        preview: truncatePreview(row.preview, 48),
        heuristicRisk: risk,
      });
    }
  }
  return capList(hits, maxCandidates);
}

export function chunkList<T>(items: T[], size: number): T[][] {
  if (size <= 0 || items.length === 0) {
    return items.length ? [items] : [];
  }
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
