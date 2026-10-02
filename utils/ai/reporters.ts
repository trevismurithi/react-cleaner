import Table from "cli-table3";
import path from "path";
import type { ChalkInstance } from "../../types";
import { formatFilePath } from "../../controllers/summary";
import {
  flattenFoundByRisk,
  numberedUnusedPaths,
  truncatePreview,
} from "./pack";
import type {
  AiCommandId,
  AiEnvelope,
  AiGenericResult,
  AiPruneLogsResult,
  AiReporter,
  AiScanItem,
  AiScanKind,
  FlattenedLogHit,
} from "./types";

const RULE = "════════════════════════════════════════════════";

const JSON_RULES = "JSON only. No invented files. Prefer review over delete.";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function printBriefChrome(
  chalk: ChalkInstance,
  model: string,
  envelope: AiEnvelope
): void {
  console.log(chalk.magenta(RULE));
  console.log(chalk.magenta.bold(`AI brief (${model})`));
  if (envelope.headline) {
    console.log(chalk.white(envelope.headline));
  }
}

function printBriefFooter(
  chalk: ChalkInstance,
  envelope: AiEnvelope
): void {
  if (Array.isArray(envelope.warnings) && envelope.warnings.length > 0) {
    console.log(chalk.yellow("Warnings:"));
    for (const warning of envelope.warnings.slice(0, 6)) {
      console.log(chalk.yellow(`  - ${warning}`));
    }
  }
  if (envelope.nextCommand) {
    console.log(chalk.cyan(`Next: ${envelope.nextCommand}`));
  }
  console.log(chalk.magenta(RULE));
}

export function printGenericBrief(
  chalk: ChalkInstance,
  envelope: AiEnvelope,
  _findings: unknown,
  model: string
): void {
  printBriefChrome(chalk, model, envelope);
  const result = envelope.result as AiGenericResult | undefined;
  const priorities = Array.isArray(result?.priorities) ? result.priorities : [];
  for (const row of priorities.slice(0, 6)) {
    const item = row.item || "";
    const why = row.why || "";
    const action = row.action ? chalk.gray(` [${row.action}]`) : "";
    console.log(chalk.white(`  • ${item}${action}`));
    if (why) {
      console.log(chalk.gray(`    ${why}`));
    }
  }
  printBriefFooter(chalk, envelope);
}

function printScanKindTable(
  chalk: ChalkInstance,
  title: string,
  rows: Array<{ file: string; score: number }>
): void {
  if (rows.length === 0) {
    return;
  }
  console.log(chalk.white.bold(`${title} — ${rows.length}`));
  const table = new Table({
    head: [chalk.cyan("File"), chalk.cyan("Score")],
    colWidths: [88, 10],
    style: { head: [], border: [] },
  });
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  for (const row of sorted) {
    table.push([
      chalk.white(formatFilePath(path.resolve(row.file), 84)),
      chalk.magenta(String(row.score)),
    ]);
  }
  console.log(table.toString());
}

function printScanBrief(
  chalk: ChalkInstance,
  envelope: AiEnvelope,
  findings: unknown,
  model: string
): void {
  const pack = asRecord(findings);
  const files = Array.isArray(pack.files)
    ? (pack.files as Array<{ id: string; file: string }>)
    : [];
  const byId = new Map(files.map((row) => [row.id, row.file]));
  const result = envelope.result as { items?: AiScanItem[] } | undefined;
  const items = Array.isArray(result?.items) ? result.items : [];
  const assigned = new Set<string>();
  const buckets: Record<AiScanKind, Array<{ file: string; score: number }>> = {
    asset: [],
    code: [],
  };

  for (const item of items) {
    const file = byId.get(item.id);
    if (!file || assigned.has(item.id)) {
      continue;
    }
    assigned.add(item.id);
    buckets[item.kind].push({ file, score: item.score });
  }

  printBriefChrome(chalk, model, envelope);
  console.log(
    chalk.gray(
      `Name-only classification of ${files.length} unused file(s) · asset-code vs code`,
    ),
  );
  printScanKindTable(chalk, "Asset-code", buckets.asset);
  printScanKindTable(chalk, "Code", buckets.code);

  const unscored = files.filter((row) => !assigned.has(row.id));
  if (unscored.length > 0) {
    console.log(chalk.gray(`Unscored — ${unscored.length}`));
    for (const row of unscored.slice(0, 40)) {
      console.log(chalk.gray(`  • ${row.file}`));
    }
  }
  printBriefFooter(chalk, envelope);
}

function printPruneLogsBrief(
  chalk: ChalkInstance,
  envelope: AiEnvelope,
  findings: unknown,
  model: string
): void {
  const pack = asRecord(findings);
  const logs = Array.isArray(pack.logs) ? (pack.logs as FlattenedLogHit[]) : [];
  const byId = new Map(logs.map((hit) => [hit.id, hit]));
  const result = envelope.result as AiPruneLogsResult | undefined;
  const buckets = result?.buckets || { high: [], medium: [], low: [] };

  printBriefChrome(chalk, model, envelope);
  if (pack.domain) {
    console.log(chalk.gray(`Domain: ${pack.domain}`));
  }

  const assigned = new Set<string>();
  const resolved: Record<"high" | "medium" | "low", FlattenedLogHit[]> = {
    high: [],
    medium: [],
    low: [],
  };

  for (const risk of ["high", "medium", "low"] as const) {
    const items = Array.isArray(buckets[risk]) ? buckets[risk] : [];
    for (const item of items) {
      const hit = byId.get(item.id);
      if (!hit || assigned.has(item.id)) {
        continue;
      }
      assigned.add(item.id);
      resolved[risk].push({
        ...hit,
        preview: item.why
          ? `${hit.preview} — ${truncatePreview(item.why, 60)}`
          : hit.preview,
      });
    }
  }

  for (const hit of logs) {
    if (!assigned.has(hit.id)) {
      resolved[hit.heuristicRisk].push(hit);
    }
  }

  const tiers: Array<{
    key: "high" | "medium" | "low";
    title: string;
    style: ChalkInstance;
  }> = [
    { key: "high", title: "High-risk (AI + domain)", style: chalk.red },
    { key: "medium", title: "Medium-risk (AI + domain)", style: chalk.yellow },
    { key: "low", title: "Low-risk (AI + domain)", style: chalk.green },
  ];

  for (const { key, title, style } of tiers) {
    const items = resolved[key];
    if (items.length === 0) {
      continue;
    }
    console.log(style.bold(`${title} — ${items.length} hit(s)`));
    const table = new Table({
      head: [chalk.cyan("File"), chalk.cyan("Line"), chalk.cyan("Call / why")],
      colWidths: [52, 6, 72],
      style: { head: [], border: [] },
    });
    for (const row of items.slice(0, 40)) {
      table.push([
        chalk.white(formatFilePath(path.resolve(row.file), 48)),
        chalk.white(row.line != null ? String(row.line) : ""),
        chalk.gray(truncatePreview(row.preview, 68)),
      ]);
    }
    console.log(table.toString());
  }

  if (Array.isArray(result?.notes)) {
    for (const note of result.notes.slice(0, 4)) {
      console.log(chalk.gray(note));
    }
  }
  printBriefFooter(chalk, envelope);
}

const reporters: Record<AiCommandId, AiReporter> = {
  scan: {
    id: "scan",
    numPredict: 1536,
    batchSize: 40,
    system: [
      "Qleaner scan. Classify EVERY unused file id from the filename/path only.",
      "kind=asset if the module looks like it holds or re-exports media (icon, logo, image, svg, pdf, font, assets/, images/, icons/).",
      "kind=code for hooks, UI, queries, routes, stories, pages, utils.",
      "Do not read file contents. Do not invent ids. Score 0-100 is confidence of that kind.",
      JSON_RULES,
      '{"command":"scan","headline":"","warnings":[],"nextCommand":"","result":{"items":[{"id":"1","kind":"code","score":90}]}}',
      "One item per id. No why. kind: asset|code.",
    ].join(" "),
    buildPack: (findings) => {
      const data = asRecord(findings);
      const files = numberedUnusedPaths(data.unusedFiles);
      return {
        files,
        total: data.total ?? files.length,
      };
    },
    render: printScanBrief,
  },
  summary: {
    id: "summary",
    numPredict: 512,
    system: [
      "Qleaner summary brief.",
      "Write a short health narrative from the totals, health score, and hotspots. Give three concrete next actions.",
      JSON_RULES,
      '{"command":"summary","headline":"","warnings":[],"nextCommand":"","result":{"priorities":[{"item":"","why":"","action":"review"}]}}',
      "Max 6 priorities. action: review|remove|keep|configure|uninstall.",
    ].join(" "),
    buildPack: (findings) => findings,
  },
  "prune-logs": {
    id: "prune-logs",
    numPredict: 1024,
    requiresDomain: true,
    system: [
      "Qleaner prune-logs. Re-rank hits for domain. Keep every id once. Secrets stay high.",
      JSON_RULES,
      '{"command":"prune-logs","headline":"","warnings":[],"nextCommand":"","result":{"buckets":{"high":[{"id":"","why":""}],"medium":[],"low":[]},"notes":[]}}',
    ].join(" "),
    buildPack: (findings, ctx) => {
      const data = asRecord(findings);
      const logs = flattenFoundByRisk(data.foundByRisk);
      return {
        domain: data.domain ?? ctx.domain,
        heuristicNote:
          "high/medium/low is generic regex plus project consoleLogPatterns, not domain policy",
        logs,
        totals: {
          total: data.total,
          high: data.highRisk,
          medium: data.mediumRisk,
          low: data.lowRisk,
        },
      };
    },
    render: printPruneLogsBrief,
  },
};

export function getReporter(id: AiCommandId): AiReporter {
  return reporters[id];
}
