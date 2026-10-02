/** Surgical-pass keys stored under `parentGraph.fixes`. */
export type FixPassKey =
  | "pruneInternal"
  | "nukeConsoleLogs"
  | "deduplicateLogic";

export type Fixes = Record<FixPassKey, Record<string, string>>;

export type Framework =
  | "react"
  | "nextjs"
  | "vue"
  | "remix"
  | "svelte"
  | "nuxt"
  | "vanilla";
export type PackageManager = "npm" | "yarn" | "pnpm";

export interface QleanerAiConfig {
  enabled: boolean;
  provider: "ollama" | "openai";
  endpoint: string;
  model: string;
  maxCandidates: number;
  /** Force local pack sizes when using an OpenAI-compatible 7B proxy. */
  profile?: "local" | "cloud";
}

export interface ConsoleLogPatternsConfig {
  high: string[];
  medium: string[];
  ignore: string[];
}

export interface QleanerConfig {
  framework: Framework;
  codeAlias: string | null;
  paths: Record<string, unknown>;
  packageManager: PackageManager;
  excludeDir: string[];
  excludeFile: string[];
  excludeExtensions: string[];
  excludeDirPrint: string[];
  excludeFilePrint: string[];
  excludeDirAssets: string[];
  excludeFileAssets: string[];
  excludeDirCode: string[];
  excludeFileCode: string[];
  /** Product domain for optional local-AI ranking (e.g. healthcare, fintech). */
  domain?: string | null;
  /** Extra console-log risk regexes (string sources). Applied before builtin lists. */
  consoleLogPatterns?: ConsoleLogPatternsConfig;
  /** Local Ollama settings. Off by default; `--explain` still opts in per run. */
  ai?: QleanerAiConfig;
  /** @deprecated Ignored — image scan uses multi-strategy resolution. */
  isRootFolderReferenced?: boolean;
  /** @deprecated Ignored — image scan uses multi-strategy resolution. */
  alias?: boolean;
}

/** Runtime graph node for source files / modules. */
export interface GraphNode {
  file: string;
  hash: string | null;
  imports: Set<string>;
  imported: Map<string, Set<[string, string] | string[]>>;
  importedBy: Set<string>;
  exports: Set<string>;
  reExportedBy: Set<string>;
  reExported: Set<string>;
  lastModified: number | null;
  size: number;
}

/** Runtime node in the image dependency graph. */
export interface ImageGraphNode {
  file: string;
  size: number;
  hash: string | null;
  imports: Set<string>;
  importedBy: Set<string>;
  lastModified: number | null;
  isImage?: boolean;
  exports?: Set<string>;
  reExported?: Set<string>;
  reExportedBy?: Set<string>;
}

export type Graph = Map<string, GraphNode>;
export type ImageGraph = Map<string, ImageGraphNode>;

export interface UnusedFileEntry {
  file: string;
  size: number;
}

export interface ParentGraph {
  graph: Graph;
  unusedFiles: Set<UnusedFileEntry | string>;
  fixes: Fixes;
}

export interface ImageParentGraph {
  imageGraph: ImageGraph;
  unusedImages: Set<UnusedFileEntry | string>;
}

/** Serialized forms stored in unused-check-cache.json */
export interface SerializedGraphNode {
  file: string;
  hash: string | null;
  imports: string[];
  importedBy: string[];
  exports: string[];
  reExported: string[];
  reExportedBy: string[];
  imported: Record<string, Array<[string, string] | string[]>>;
  lastModified: number | null;
  size: number;
}

export interface SerializedImageGraphNode {
  file: string;
  size: number;
  hash: string | null;
  imports: string[];
  importedBy: string[];
  exports?: string[];
  reExported?: string[];
  reExportedBy?: string[];
  lastModified: number | null;
  isImage?: boolean;
}

export interface SerializedParentGraph {
  graph: Record<string, SerializedGraphNode> | Record<string, unknown>;
  unusedFiles: Array<UnusedFileEntry | string>;
  fixes: Fixes;
}

export interface SerializedImageParentGraph {
  imageGraph: Record<string, SerializedImageGraphNode> | Record<string, unknown>;
  unusedImages: Array<UnusedFileEntry | string>;
}

export interface CacheFile {
  parentGraph: SerializedParentGraph;
  imageParentGraph: SerializedImageParentGraph;
}

/** Dry-run row that a later apply pass can match by `surgicalCandidateKey`. */
export interface SurgicalCandidate {
  file: string;
  line?: number;
  name?: string;
  kind?: string;
  preview?: string;
  risk?: "high" | "medium" | "low";
}

export interface ScanOptions {
  clearCache?: boolean;
  quiet?: boolean;
  /** Optional AI brief after findings (Ollama or OpenAI-compatible). */
  explain?: boolean;
  /** Product domain for AI ranking (e.g. healthcare). */
  domain?: string | null;
  /** Optional question constrained to this command’s findings. */
  ask?: string;
  excludeFilePrint?: string[];
  excludeDirPrint?: string[];
  excludeDir?: string[];
  excludeFile?: string[];
  excludeExtensions?: string[];
  excludeDirAssets?: string[];
  excludeFileAssets?: string[];
  excludeDirCode?: string[];
  excludeFileCode?: string[];
  [key: string]: unknown;
}

export type PathResolver = (
  request: string,
  issuer?: string
) => string | false | null | undefined;

export type ChalkInstance = typeof import("chalk").default;
