export type AiCommandId = "scan" | "summary" | "prune-logs";

export interface AiRunOptions {
  explain?: boolean;
  domain?: string | null;
  ask?: string;
  quiet?: boolean;
}

export interface AiPriority {
  item: string;
  why: string;
  action?: string;
}

export interface AiGenericResult {
  priorities: AiPriority[];
}

export type AiScanKind = "asset" | "code";

export interface AiScanItem {
  id: string;
  kind: AiScanKind;
  score: number;
}

export interface AiScanResult {
  items: AiScanItem[];
}

export interface AiPruneLogsBucketItem {
  id: string;
  why: string;
}

export interface AiPruneLogsResult {
  buckets: {
    high: AiPruneLogsBucketItem[];
    medium: AiPruneLogsBucketItem[];
    low: AiPruneLogsBucketItem[];
  };
  notes?: string[];
}

export interface AiEnvelope<T = unknown> {
  command: string;
  headline: string;
  warnings: string[];
  nextCommand?: string;
  result: T;
}

export interface FlattenedLogHit {
  id: string;
  file: string;
  line?: number;
  preview: string;
  heuristicRisk: "high" | "medium" | "low";
}

export interface AiReporterContext {
  domain: string | null;
  ask: string | null;
  maxCandidates: number;
}

export interface AiReporter {
  id: AiCommandId;
  system: string;
  buildPack: (findings: unknown, ctx: AiReporterContext) => unknown;
  numPredict?: number;
  batchSize?: number;
  requiresDomain?: boolean;
  render?: (
    chalk: import("../../types").ChalkInstance,
    envelope: AiEnvelope,
    findings: unknown,
    model: string
  ) => void;
}
