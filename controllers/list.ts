import { unUsedFiles } from "../command";
import { hydrateGraph } from "../utils/graphUtils";
import { findUnusedExports } from "./code";
import Table from "cli-table3";
import {
  askDeleteFiles,
  askSelectCandidates,
  loadTSConfig,
  moveFromTrash,
  uninstallDependency,
  combineValues,
  updateFileAssociatedStats,
  moveToTrash,
  logStage,
  type TrashableFile,
} from "../utils/utils";
import fs from "fs";
import path from "path";
import {
  summarizeAll,
  getTop10LargestFiles,
  dependenciesSummary,
  collectSummaryAiPack,
  formatFilePath,
} from "./summary";
import { maybeExplain } from "../utils/ai/run";
import type { AiCommandId } from "../utils/ai/types";
import { query, unusedDependencies as findUnusedDeps } from "./query";
import {
  editFile,
  pruneInternal,
  nukeConsoleLogs,
  deduplicateLogic,
} from "../utils/editFile";
import { CONSOLE_LOG_HIGH_RISK_CATEGORY_LABELS } from "../utils/consoleLogHighRiskPatterns";
import { CONSOLE_LOG_MEDIUM_RISK_CATEGORY_LABELS } from "../utils/consoleLogMediumRiskPatterns";
import { loadProjectConsoleLogPatterns } from "../utils/consoleLogCustomPatterns";
import { buildContentPaths } from "../utils/pathBuilder";
import fg from "fast-glob";
import type {
  CacheFile,
  ChalkInstance,
  Graph,
  QleanerConfig,
  ScanOptions,
  SurgicalCandidate,
  UnusedFileEntry,
} from "../types";

const RULE = "════════════════════════════════════════════════";
const CACHE_FILE = "unused-check-cache.json";
const TABLE_STYLE = { head: [] as string[], border: [] as string[] };

type RuleColor = "yellow" | "cyan" | "green" | "red" | "magenta" | "blue" | "white" | "gray";

interface SurgicalOptions extends ScanOptions {
  dryRun?: boolean;
  message?: string;
  report?: boolean;
  listRiskCategories?: boolean;
  listRiskCategoriesInfo?: boolean;
  freshScan?: boolean;
  fix?: boolean;
  autoFix?: boolean;
  interactive?: boolean;
  table?: boolean;
  uninstall?: boolean;
  largestFiles?: boolean;
  dependencies?: boolean;
  clearCache?: boolean;
  explain?: boolean;
  domain?: string | null;
  ask?: string;
}

interface SurgicalStats {
  totalItemsRemoved?: number;
  totalLinesRemoved?: number;
  bytesSaved?: number;
  filesModified?: number;
  total?: number;
  highRisk?: number;
  mediumRisk?: number;
  lowRisk?: number;
  found?: Array<{ file?: string; line?: number; name?: string; kind?: string }>;
  foundByRisk?: {
    high?: Array<{ file?: string; line?: number; preview?: string }>;
    medium?: Array<{ file?: string; line?: number; preview?: string }>;
    low?: Array<{ file?: string; line?: number; preview?: string }>;
  };
  [key: string]: unknown;
}

type SurgicalTransform = (
  files: string[],
  dryRun: boolean | undefined,
  chalk: ChalkInstance,
  message: string | undefined,
  selected?: SurgicalCandidate[]
) => Promise<SurgicalStats | number>;

function cachePath(): string {
  return path.join(process.cwd(), CACHE_FILE);
}

function printRule(chalk: ChalkInstance, color: RuleColor = "yellow"): void {
  console.log(chalk[color](RULE));
}

/** Load and validate `parentGraph.graph`; log on failure. */
function loadHydratedGraph(chalk: ChalkInstance): Graph | null {
  const file = cachePath();
  if (!fs.existsSync(file)) {
    console.log(
      chalk.red(
        '⚠️  Cache file not found. Please run "qleaner scan" first to generate the cache.',
      ),
    );
    return null;
  }
  let cache: CacheFile;
  try {
    cache = JSON.parse(fs.readFileSync(file, "utf8")) as CacheFile;
  } catch {
    console.log(
      chalk.red(
        '⚠️  Error reading cache file. Please run "qleaner scan" again.',
      ),
    );
    return null;
  }
  if (!cache.parentGraph?.graph) {
    console.log(
      chalk.red('⚠️  Invalid cache file. Please run "qleaner scan" again.'),
    );
    return null;
  }
  return hydrateGraph(cache.parentGraph.graph);
}

function printSurgicalSummary(
  chalk: ChalkInstance,
  heading: string,
  stats: SurgicalStats
): void {
  console.log(chalk.yellow(`${heading}:`));
  printRule(chalk);
  console.log(chalk.yellow(`Total items removed: ${stats.totalItemsRemoved}`));
  console.log(chalk.yellow(`Total lines removed: ${stats.totalLinesRemoved}`));
  console.log(chalk.yellow(`Total bytes saved: ${stats.bytesSaved}`));
  console.log(chalk.yellow(`Total files modified: ${stats.filesModified}`));
  printRule(chalk);
}

/** Numeric total from a dry-run result (`nukeConsoleLogs` → `{ total, highRisk, mediumRisk, lowRisk, foundByRisk? }`). */
function dryRunItemTotal(result: unknown): number {
  if (
    result &&
    typeof result === "object" &&
    typeof (result as SurgicalStats).total === "number"
  ) {
    return (result as SurgicalStats).total as number;
  }
  return typeof result === "number" ? result : 0;
}

/** Max rows per risk tier when printing `foundByRisk` (dry-run console log pass). */
const CONSOLE_LOG_DRY_RUN_PRINT_MAX_PER_TIER = 100;

/** Max rows when printing `prune` dry-run report (`-r` / `--report`). */
const PRUNE_INTERNAL_DRY_RUN_PRINT_MAX = 500;

function truncateConsolePreview(text: unknown, maxLen = 90): string {
  const s = String(text == null ? "" : text)
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= maxLen) {
    return s;
  }
  return `${s.slice(0, maxLen)}…`;
}

function printConsoleLogDryRunFoundByRisk(
  chalk: ChalkInstance,
  foundByRisk: SurgicalStats["foundByRisk"]
): void {
  if (!foundByRisk || typeof foundByRisk !== "object") {
    return;
  }

  const tiers: Array<{
    key: "high" | "medium" | "low";
    title: string;
    style: ChalkInstance;
  }> = [
    { key: "high", title: "High-risk sensitive (file:line)", style: chalk.red },
    { key: "medium", title: "Medium-risk (file:line)", style: chalk.yellow },
    { key: "low", title: "Low-risk (file:line)", style: chalk.green },
  ];

  let any = false;
  for (const { key, title, style } of tiers) {
    const items = foundByRisk[key];
    if (!Array.isArray(items) || items.length === 0) {
      continue;
    }
    any = true;
    const shown = items.slice(0, CONSOLE_LOG_DRY_RUN_PRINT_MAX_PER_TIER);
    const omitted = items.length - shown.length;

    printRule(chalk);
    console.log(style.bold(`${title} — ${items.length} hit(s)`));
    const table = newTable(
      chalk,
      ["File", "Line", "Call preview"],
      [72, 6, 72],
    );
    for (const row of shown) {
      const file = typeof row.file === "string" ? row.file : "";
      const line = row.line != null ? String(row.line) : "";
      const preview = truncateConsolePreview(row.preview, 88);
      table.push([
        chalk.white(formatFilePath(path.resolve(file), 68)),
        chalk.white(line),
        chalk.gray(preview),
      ]);
    }
    console.log(table.toString());
    if (omitted > 0) {
      console.log(
        chalk.gray(
          `… and ${omitted} more in this tier (cap ${CONSOLE_LOG_DRY_RUN_PRINT_MAX_PER_TIER} per tier).`,
        ),
      );
    }
  }

  if (any) {
    printRule(chalk);
  }
}

function printFoundItemsReport(
  chalk: ChalkInstance,
  found: Array<{ file?: string; line?: number; name?: string; kind?: string }>,
  isDryRun = true,
  subject = "Unused code",
): void {
  if (!Array.isArray(found) || found.length === 0) {
    return;
  }

  const shown = found.slice(0, PRUNE_INTERNAL_DRY_RUN_PRINT_MAX);
  const omitted = found.length - shown.length;
  const modeLabel = isDryRun ? "would be removed" : "removed";

  printRule(chalk);
  console.log(
    chalk.cyan.bold(
      `${subject} (${modeLabel}) — ${found.length} item(s) in ${new Set(found.map((r) => r.file)).size} file(s)`,
    ),
  );
  const table = newTable(
    chalk,
    ["File", "Line", "Name", "Kind"],
    [68, 6, 28, 12],
  );
  for (const row of shown) {
    const file = typeof row.file === "string" ? row.file : "";
    const line = row.line != null ? String(row.line) : "";
    const name = typeof row.name === "string" ? row.name : "";
    const kind = typeof row.kind === "string" ? row.kind : "";
    table.push([
      chalk.white(formatFilePath(path.resolve(file), 64)),
      chalk.white(line),
      chalk.white(name),
      chalk.gray(kind),
    ]);
  }
  console.log(table.toString());
  if (omitted > 0) {
    console.log(
      chalk.gray(
        `… and ${omitted} more (cap ${PRUNE_INTERNAL_DRY_RUN_PRINT_MAX} rows).`,
      ),
    );
  }
  printRule(chalk);
}

function printUnusedExportsReport(
  chalk: ChalkInstance,
  found: Array<{ file?: string; name?: string }>,
  isDryRun = true,
): void {
  if (!Array.isArray(found) || found.length === 0) {
    return;
  }

  const shown = found.slice(0, PRUNE_INTERNAL_DRY_RUN_PRINT_MAX);
  const omitted = found.length - shown.length;
  const modeLabel = isDryRun ? "would be removed" : "removed";

  printRule(chalk);
  console.log(
    chalk.cyan.bold(
      `Unreferenced exports (${modeLabel}) — ${found.length} export(s) in ${new Set(found.map((r) => r.file)).size} file(s)`,
    ),
  );
  const table = newTable(
    chalk,
    ["Export", "File"],
    [36, 72],
  );
  for (const row of shown) {
    const file = typeof row.file === "string" ? row.file : "";
    const name = typeof row.name === "string" ? row.name : "";
    table.push([
      chalk.white(name),
      chalk.white(formatFilePath(path.resolve(file), 68)),
    ]);
  }
  console.log(table.toString());
  if (omitted > 0) {
    console.log(
      chalk.gray(
        `… and ${omitted} more (cap ${PRUNE_INTERNAL_DRY_RUN_PRINT_MAX} rows).`,
      ),
    );
  }
  printRule(chalk);
}

/** export name → file path */
function buildUnusedExportsFound(
  unUsedExportsWithPath: Map<string, string>
): Array<{ file: string; name: string; kind: string }> {
  const found: Array<{ file: string; name: string; kind: string }> = [];
  for (const [name, file] of unUsedExportsWithPath.entries()) {
    found.push({ file, name, kind: "export" });
  }
  return found;
}

function printSurgicalDryRunSummary(
  chalk: ChalkInstance,
  stats: SurgicalStats | number | undefined,
  dryPrefix: string
): void {
  const detail =
    stats &&
    typeof stats === "object" &&
    typeof stats.total === "number" &&
    typeof stats.highRisk === "number" &&
    typeof stats.mediumRisk === "number" &&
    typeof stats.lowRisk === "number"
      ? `${stats.total} (high-risk sensitive: ${stats.highRisk}, medium: ${stats.mediumRisk}, low: ${stats.lowRisk})`
      : stats &&
          typeof stats === "object" &&
          typeof stats.total === "number" &&
          Array.isArray(stats.found)
        ? `${stats.total} symbol(s)`
        : `${stats}`;
  console.log(chalk.yellow(`${dryPrefix}: ${detail}`));
}

function candidatesFromStats(stats: unknown): SurgicalCandidate[] {
  if (!stats || typeof stats !== "object") {
    return [];
  }
  const result = stats as SurgicalStats;
  if (Array.isArray(result.found) && result.found.length > 0) {
    return result.found.map((row) => ({
      file: typeof row.file === "string" ? row.file : "",
      line: row.line,
      name: row.name,
      kind: row.kind,
    }));
  }
  const byRisk = result.foundByRisk;
  if (!byRisk || typeof byRisk !== "object") {
    return [];
  }
  const candidates: SurgicalCandidate[] = [];
  for (const risk of ["high", "medium", "low"] as const) {
    const items = byRisk[risk];
    if (!Array.isArray(items)) {
      continue;
    }
    for (const row of items) {
      candidates.push({
        file: typeof row.file === "string" ? row.file : "",
        line: row.line,
        preview: row.preview,
        risk,
      });
    }
  }
  return candidates;
}

function candidateChoiceTitle(item: SurgicalCandidate): string {
  const loc = `${item.file}${item.line != null ? `:${item.line}` : ""}`;
  if (item.preview) {
    const preview = truncateConsolePreview(item.preview, 60);
    const risk = item.risk ? `[${item.risk}] ` : "";
    return `${risk}${loc} ${preview}`;
  }
  const name = item.name ?? "";
  const kind = item.kind ? ` (${item.kind})` : "";
  return `${loc} ${name}${kind}`.trim();
}

async function applySurgicalStats(
  chalk: ChalkInstance,
  stats: SurgicalStats | number | undefined,
  summaryHeading: string,
  report: boolean | undefined
): Promise<SurgicalStats | number | undefined> {
  const statsForSave = stripFoundFromStats(stats);
  await updateFileAssociatedStats(new Date().toISOString(), statsForSave as any);
  printSurgicalSummary(chalk, summaryHeading, statsForSave as SurgicalStats);
  if (report) {
    maybePrintSurgicalFoundReport(chalk, stats, false);
  }
  return stats;
}

async function explainSurgicalStats(
  chalk: ChalkInstance,
  commandId: AiCommandId | undefined,
  stats: SurgicalStats | number | undefined,
  options: SurgicalOptions
): Promise<void> {
  if (!commandId || stats == null) {
    return;
  }
  if (typeof stats === "number" && stats === 0) {
    return;
  }
  if (
    typeof stats === "object" &&
    (stats.total === 0 ||
      (Array.isArray(stats.found) && stats.found.length === 0 && !stats.foundByRisk))
  ) {
    return;
  }
  const findings =
    typeof stats === "object"
      ? { ...stats, domain: options.domain }
      : { total: stats, domain: options.domain };
  await maybeExplain(commandId, findings, options, chalk);
}

async function runSurgicalPass(
  chalk: ChalkInstance,
  pathToScan: string,
  options: SurgicalOptions,
  transform: SurgicalTransform,
  labels: {
    dryPrefix: string;
    summaryHeading: string;
    commandId?: AiCommandId;
  }
): Promise<SurgicalStats | number | undefined> {
  const files = await getConfig(pathToScan);
  const interactive = Boolean(options.interactive) && !options.dryRun;

  if (options.dryRun || interactive) {
    const stats = await transform(files, true, chalk, options.message);
    printSurgicalDryRunSummary(chalk, stats, labels.dryPrefix);
    const showRiskTables =
      Boolean(options.listRiskCategories) || interactive;
    if (
      stats &&
      typeof stats === "object" &&
      stats.foundByRisk &&
      showRiskTables
    ) {
      printConsoleLogDryRunFoundByRisk(chalk, stats.foundByRisk);
    }
    if (options.report || interactive) {
      maybePrintSurgicalFoundReport(chalk, stats, true);
    }
    await explainSurgicalStats(chalk, labels.commandId, stats, options);
    if (options.dryRun) {
      return stats;
    }

    const candidates = candidatesFromStats(stats);
    if (candidates.length === 0) {
      return stats;
    }
    const selected = await askSelectCandidates(
      "Select items to remove",
      candidates.map((item) => ({
        title: candidateChoiceTitle(item),
        value: item,
        selected: item.risk === "low",
      })),
    );
    if (selected.length === 0) {
      console.log(chalk.gray("No items selected. Nothing was removed."));
      return stats;
    }
    const applied = await transform(
      files,
      false,
      chalk,
      options.message,
      selected,
    );
    return applySurgicalStats(
      chalk,
      applied,
      labels.summaryHeading,
      options.report,
    );
  }

  const stats = await transform(files, false, chalk, options.message);
  return applySurgicalStats(
    chalk,
    stats,
    labels.summaryHeading,
    options.report,
  );
}

function stripFoundFromStats(stats: unknown): unknown {
  if (!stats || typeof stats !== "object" || !Array.isArray((stats as SurgicalStats).found)) {
    return stats;
  }
  const copy = { ...(stats as SurgicalStats) };
  delete copy.found;
  return copy;
}

function maybePrintSurgicalFoundReport(
  chalk: ChalkInstance,
  stats: unknown,
  isDryRun: boolean
): void {
  if (
    !stats ||
    typeof stats !== "object" ||
    !Array.isArray((stats as SurgicalStats).found) ||
    ((stats as SurgicalStats).found as unknown[]).length === 0
  ) {
    return;
  }
  const found = (stats as SurgicalStats).found!;
  const first = found[0];
  if (first && first.kind === "export") {
    printUnusedExportsReport(chalk, found, isDryRun);
    return;
  }
  const subject =
    first && (first.kind === "function" || first.kind === "class")
      ? "Duplicate code"
      : "Unused code";
  printFoundItemsReport(chalk, found, isDryRun, subject);
}

async function getConfig(pathToScan: string): Promise<string[]> {
  const configPath = path.join(process.cwd(), "qleaner.config.json");
  let config: ScanOptions = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8")) as ScanOptions;
  }
  return fg(buildContentPaths(pathToScan, config));
}

function newTable(
  chalk: ChalkInstance,
  heads: string[],
  colWidths: number[]
) {
  return new Table({
    head: heads.map((h) => chalk.cyan(h)),
    colWidths,
    style: TABLE_STYLE,
  });
}

function printLinesOrTable(
  chalk: ChalkInstance,
  rows: string[],
  useTable: boolean | undefined,
  singleColumnLabel: string
): void {
  if (useTable) {
    const table = newTable(chalk, [singleColumnLabel], [100]);
    rows.forEach((row) => table.push([chalk.white(row)]));
    console.log(table.toString());
  } else {
    rows.forEach((row) => console.log(chalk.yellow(row)));
  }
}

export async function tidyUp(
  chalk: ChalkInstance,
  pathToScan: string,
  options: SurgicalOptions = {}
): Promise<void> {
  const interactive = Boolean(options.interactive);
  const autoFix = Boolean(options.autoFix) && !interactive;
  const report = Boolean(options.report);
  const listRiskCategories =
    Boolean(options.listRiskCategories) || report;
  const nested: SurgicalOptions = {
    explain: false,
  };

  logStage(chalk, "Start Qleaner tidy");
  await scan(chalk, pathToScan, { quiet: true, explain: false });

  const steps = [
    {
      reportTitle: "Console logs",
      checkLabel: "Checking for console logs",
      fixLabel: "Removing console logs",
      done: "Prune console logs completed",
      dry: () =>
        pruneConsoleLogs(chalk, pathToScan, {
          dryRun: true,
          message: "Checking for console logs",
          report,
          listRiskCategories,
          listRiskCategoriesInfo: options.listRiskCategoriesInfo,
          ...nested,
        }),
      fix: () =>
        pruneConsoleLogs(chalk, pathToScan, {
          message: "Removing console logs",
          report,
          listRiskCategories,
          listRiskCategoriesInfo: options.listRiskCategoriesInfo,
          interactive,
          ...nested,
        }),
    },
    {
      reportTitle: "Unused code",
      checkLabel: "Checking for unused code",
      fixLabel: "Removing unused code",
      done: "Prune unused code completed",
      dry: () =>
        pruneUnusedCode(chalk, pathToScan, {
          dryRun: true,
          message: "Checking for unused code",
          report,
          ...nested,
        }),
      fix: () =>
        pruneUnusedCode(chalk, pathToScan, {
          message: "Removing unused code",
          report,
          interactive,
          ...nested,
        }),
    },
    {
      reportTitle: "Duplicate code",
      checkLabel: "Checking for duplicate code",
      fixLabel: "Removing duplicate code",
      done: "Remove duplicate code completed",
      dry: () =>
        checkForDuplicates(chalk, pathToScan, {
          dryRun: true,
          message: "Checking for duplicate code",
          report,
          ...nested,
        }),
      fix: () =>
        checkForDuplicates(chalk, pathToScan, {
          message: "Removing duplicate code",
          report,
          interactive,
          ...nested,
        }),
    },
    {
      reportTitle: "Unreferenced exports",
      checkLabel: "Checking for unreferenced exports",
      fixLabel: "Removing unreferenced exports",
      done: "Remove unreferenced exports completed",
      dry: () =>
        unusedExports(chalk, pathToScan, {
          dryRun: true,
          message: "Checking for unreferenced exports",
          report,
          ...nested,
        }),
      fix: () =>
        unusedExports(chalk, pathToScan, {
          fix: true,
          message: "Removing unreferenced exports",
          report,
          interactive,
          ...nested,
        }),
    },
  ];

  for (const step of steps) {
    if (report && step.reportTitle) {
      printRule(chalk, "cyan");
      console.log(chalk.cyan.bold(`Tidy — ${step.reportTitle}`));
    }
    if (interactive) {
      logStage(chalk, step.fixLabel);
      await step.fix();
      logStage(chalk, step.fixLabel, "done");
      continue;
    }
    logStage(chalk, step.checkLabel);
    const count = await step.dry();
    logStage(chalk, step.done, "done");
    if (dryRunItemTotal(count) > 0 && autoFix) {
      logStage(chalk, step.fixLabel);
      await step.fix();
      logStage(chalk, step.fixLabel, "done");
    }
  }

  if (autoFix) {
    logStage(chalk, "Rescanning unused files after tidy fixes");
    await scan(chalk, pathToScan, {
      dryRun: true,
      clearCache: false,
      explain: false,
    });
  } else if (interactive) {
    logStage(chalk, "Scanning unused files after tidy");
    await scan(chalk, pathToScan, { clearCache: false, explain: false });
  }

  logStage(chalk, "Tidy completed", "done");
}

export async function checkForDuplicates(
  chalk: ChalkInstance,
  pathToScan: string,
  options: SurgicalOptions = {}
): Promise<SurgicalStats | number | undefined> {
  return runSurgicalPass(chalk, pathToScan, options, deduplicateLogic as SurgicalTransform, {
    dryPrefix: "Total duplicates found",
    summaryHeading: "Check for duplicates",
  });
}

function printConsoleLogRiskCategoryReference(chalk: ChalkInstance): void {
  // Resolve compiled .js at runtime (dist/); fall back for tsx/dev.
  const resolveUtil = (base: string): string => {
    try {
      return require.resolve(`../utils/${base}.js`);
    } catch {
      return require.resolve(`../utils/${base}`);
    }
  };
  const highPath = resolveUtil("consoleLogHighRiskPatterns");
  const mediumPath = resolveUtil("consoleLogMediumRiskPatterns");
  const tierPath = resolveUtil("editFile");

  printRule(chalk, "cyan");
  console.log(chalk.cyan.bold("Console log risk tiers (dry-run & tidy)"));
  console.log(
    chalk.gray(
      "Each removable console.debug/log/info/… call is classified from its argument source text: ignore → custom high → builtin high → custom medium → builtin medium → low.",
    ),
  );
  printRule(chalk, "cyan");

  const custom = loadProjectConsoleLogPatterns();
  console.log(chalk.yellow.bold("Project consoleLogPatterns"));
  console.log(
    chalk.white("Config: qleaner.config.json → consoleLogPatterns (high, medium, ignore)"),
  );
  const listPatterns = (label: string, patterns: string[]) => {
    console.log(chalk.white(`  ${label}: ${patterns.length}`));
    patterns.slice(0, 20).forEach((pattern) => {
      console.log(chalk.gray(`    /${pattern}/i`));
    });
  };
  listPatterns("high", custom.raw.high);
  listPatterns("medium", custom.raw.medium);
  listPatterns("ignore", custom.raw.ignore);
  if (custom.invalid.length > 0) {
    console.log(chalk.red(`  skipped invalid patterns: ${custom.invalid.length}`));
  }
  console.log();

  console.log(chalk.yellow.bold("High-risk sensitive"));
  console.log(chalk.white(`Patterns file: ${highPath}`));
  console.log(
    chalk.gray(`${CONSOLE_LOG_HIGH_RISK_CATEGORY_LABELS.length} sections:`),
  );
  CONSOLE_LOG_HIGH_RISK_CATEGORY_LABELS.forEach((label, i) => {
    console.log(chalk.white(`  ${i + 1}. ${label}`));
  });
  console.log();

  console.log(chalk.yellow.bold("Medium-risk"));
  console.log(chalk.white(`Patterns file: ${mediumPath}`));
  console.log(
    chalk.gray(`${CONSOLE_LOG_MEDIUM_RISK_CATEGORY_LABELS.length} sections:`),
  );
  CONSOLE_LOG_MEDIUM_RISK_CATEGORY_LABELS.forEach((label, i) => {
    console.log(chalk.white(`  ${i + 1}. ${label}`));
  });
  console.log();

  console.log(chalk.yellow.bold("Low-risk"));
  console.log(
    chalk.white(
      "Removable console calls whose argument text does not match high- or medium-risk heuristics.",
    ),
  );
  console.log(chalk.white(`Classification logic: ${tierPath}`));
  console.log(
    chalk.gray("Search for `consoleLogDryRunRiskTier` in that file."),
  );
  console.log(
    chalk.gray(
      "Pass --explain --domain <name> to re-rank listed calls for that industry (Ollama). Domain is required for the AI re-rank.",
    ),
  );
  printRule(chalk, "cyan");
}

export async function pruneConsoleLogs(
  chalk: ChalkInstance,
  pathToScan: string,
  options: SurgicalOptions = {}
): Promise<SurgicalStats | number | undefined> {
  if (options.listRiskCategoriesInfo) {
    printConsoleLogRiskCategoryReference(chalk);
    return;
  }
  return runSurgicalPass(chalk, pathToScan, options, nukeConsoleLogs as SurgicalTransform, {
    dryPrefix: "Total console logs found",
    summaryHeading: "Prune console logs",
    commandId: "prune-logs",
  });
}

export async function pruneUnusedCode(
  chalk: ChalkInstance,
  pathToScan: string,
  options: SurgicalOptions = {}
): Promise<SurgicalStats | number | undefined> {
  return runSurgicalPass(chalk, pathToScan, options, pruneInternal as SurgicalTransform, {
    dryPrefix: "Total unused code found",
    summaryHeading: "Prune internal unused code",
  });
}

export async function unusedExports(
  chalk: ChalkInstance,
  pathToScan: string,
  options: SurgicalOptions = {}
): Promise<number> {
  await scan(chalk, pathToScan, {
    quiet: true,
    clearCache: Boolean(options.freshScan),
    explain: false,
  });
  const { unUsedExportsWithPath, fileAssociated } =
    await findUnusedExports(chalk);
  const found = buildUnusedExportsFound(unUsedExportsWithPath);

  if (found.length === 0) {
    console.log(
      chalk.green("✓ No unused exports found. All exports are in use."),
    );
    return 0;
  }

  if (options.dryRun) {
    console.log(
      chalk.yellow(`Total unused exports found: ${found.length}`),
    );
    if (options.report) {
      printUnusedExportsReport(chalk, found, true);
    }
    return found.length;
  }

  const interactive = Boolean(options.interactive);
  if (!options.fix || options.report || interactive) {
    printUnusedExportsReport(chalk, found, true);
  }

  let toRemove = unUsedExportsWithPath;
  if (interactive) {
    const selected = await askSelectCandidates(
      "Select unused exports to remove",
      found.map((item) => ({
        title: candidateChoiceTitle(item),
        value: item,
      })),
    );
    if (selected.length === 0) {
      console.log(chalk.gray("No exports selected. Nothing was removed."));
      console.log(chalk.yellow(`Total unused exports: ${found.length}`));
      return found.length;
    }
    const selectedNames = new Set(selected.map((item) => item.name));
    toRemove = new Map(
      [...unUsedExportsWithPath.entries()].filter(([name]) =>
        selectedNames.has(name),
      ),
    );
  }

  if (options.fix || interactive) {
    const stats = await editFile(
      combineValues(toRemove),
      fileAssociated,
      chalk,
      options.message,
    );
    await updateFileAssociatedStats(new Date().toISOString(), stats as any);
    if (options.report) {
      printUnusedExportsReport(
        chalk,
        interactive ? selectedExportRows(toRemove) : found,
        false,
      );
    }
  }

  console.log(chalk.yellow(`Total unused exports: ${found.length}`));
  return found.length;
}

function selectedExportRows(
  unUsedExportsWithPath: Map<string, string>
): Array<{ file: string; name: string }> {
  const rows: Array<{ file: string; name: string }> = [];
  for (const [name, file] of unUsedExportsWithPath.entries()) {
    rows.push({ file, name });
  }
  return rows;
}

export async function list(
  chalk: ChalkInstance,
  dependency: string,
  options: SurgicalOptions = {}
): Promise<void> {
  const graph = loadHydratedGraph(chalk);
  if (!graph) return;

  logStage(chalk, `Querying files using ${dependency}`);
  const filesSet = query(graph, dependency);
  logStage(chalk, "Query completed", "done");

  if (!filesSet?.size) {
    console.log(chalk.yellow(`No files found using ${dependency}`));
    return;
  }

  const files = Array.from(filesSet);
  console.log(chalk.yellow(`Files using ${dependency}:`));
  printRule(chalk);
  if (options.table) {
    printLinesOrTable(
      chalk,
      files.map((f) => formatFilePath(f, 95)),
      true,
      "File Path",
    );
  } else {
    files.forEach((file) => console.log(chalk.yellow(file)));
  }
  printRule(chalk);
  console.log(chalk.yellow(`Total files using ${dependency}: ${files.length}`));
}

export async function unusedDependencies(
  chalk: ChalkInstance,
  directoryPath = process.cwd(),
  options: SurgicalOptions = {},
): Promise<void> {
  const packageJsonPath = path.join(directoryPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    console.log(chalk.red("⚠️  Package.json not found."));
    return;
  }

  let packageJson: { dependencies?: Record<string, string> };
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };
  } catch {
    console.log(chalk.red("⚠️  Error reading package.json file."));
    return;
  }

  const deps = packageJson.dependencies;
  if (!deps || Object.keys(deps).length === 0) {
    console.log(chalk.yellow("No dependencies found in package.json."));
    return;
  }

  const graph = loadHydratedGraph(chalk);
  if (!graph) return;

  const unusedDeps = findUnusedDeps(graph, Object.keys(deps));
  if (unusedDeps.size === 0) {
    console.log(
      chalk.green(
        "✓ No unused dependencies found. All dependencies are in use.",
      ),
    );
    return;
  }

  console.log(chalk.yellow(`Unused Dependencies (${unusedDeps.size}):`));
  printRule(chalk);
  printLinesOrTable(chalk, [...unusedDeps], options.table, "Dependency Name");
  printRule(chalk);
  console.log(chalk.yellow(`Total unused dependencies: ${unusedDeps.size}`));

  if (options.uninstall) {
    for (const name of unusedDeps) {
      console.log(chalk.yellow(`Uninstalling ${name}...`));
      await uninstallDependency(name);
      console.log(chalk.green(RULE));
    }
  }
}

export async function summary(
  chalk: ChalkInstance,
  options: SurgicalOptions
): Promise<void> {
  console.log(
    chalk.yellow(
      "⚠️  Note: Make sure to run a new scan before viewing the summary for accurate results.",
    ),
  );
  console.log(
    chalk.yellow(
      "   Use the scan command to update the cache with the latest project state.\n",
    ),
  );
  if (options.largestFiles) {
    getTop10LargestFiles(chalk);
    await maybeExplain(
      "summary",
      collectSummaryAiPack("largest"),
      options,
      chalk,
    );
  } else if (options.dependencies) {
    dependenciesSummary(chalk);
    await maybeExplain(
      "summary",
      collectSummaryAiPack("dependencies"),
      options,
      chalk,
    );
  } else {
    summarizeAll(chalk);
    await maybeExplain(
      "summary",
      collectSummaryAiPack("all"),
      options,
      chalk,
    );
  }
}

export function resolveScanPathConfig(
  pathToScan: string,
  options: ScanOptions,
  chalk: ChalkInstance
): { options: ScanOptions; pathConfig: Record<string, unknown> } {
  let pathConfig: Record<string, unknown> = {};
  const configPath = path.join(pathToScan, "qleaner.config.json");
  if (!fs.existsSync(configPath)) {
    return { options, pathConfig };
  }

  const config = JSON.parse(
    fs.readFileSync(configPath, "utf8")
  ) as QleanerConfig;
  const merged = { ...config, ...options };

  if (config.paths && Object.keys(config.paths).length > 0) {
    pathConfig = config.paths;
  } else if (config.codeAlias) {
    const loaded = loadTSConfig(pathToScan, config.codeAlias)!.paths;
    if (!loaded) {
      console.log(
        chalk.red(
          '⚠️  Error reading config file. Please run "qleaner scan" again.',
        ),
      );
      pathConfig = {};
    } else {
      pathConfig = loaded;
    }
  }

  return { options: merged, pathConfig };
}

function printUnusedFileRows(
  chalk: ChalkInstance,
  fileArray: UnusedFileEntry[],
  useTable: unknown,
  dryRun: unknown
): number {
  let totalSize = 0;
  if (useTable) {
    const table = newTable(
      chalk,
      dryRun
        ? ["Unused Files (Would Delete)", "Size"]
        : ["Unused Files", "Size"],
      [90, 15],
    );
    for (const file of fileArray) {
      table.push([
        chalk.white(formatFilePath(file.file, 85)),
        chalk.yellow(`${(file.size / 1024).toFixed(2)} KB`),
      ]);
      totalSize += file.size;
    }
    console.log(table.toString());
  } else {
    for (const file of fileArray) {
      console.log(
        chalk.white("📄 ") +
          chalk.blue(formatFilePath(file.file, 85)) +
          " - " +
          chalk.yellow(`${(file.size / 1024).toFixed(2)} KB`),
      );
      totalSize += file.size;
    }
  }
  return totalSize;
}

export async function scan(
  chalk: ChalkInstance,
  pathToScan: string,
  options: SurgicalOptions
): Promise<Set<UnusedFileEntry | string>> {
  const { options: mergedOpts, pathConfig } = resolveScanPathConfig(
    pathToScan,
    options,
    chalk,
  );

  const unusedFiles = await unUsedFiles(
    chalk,
    pathToScan,
    pathConfig as Record<string, string[]>,
    mergedOpts,
  );

  if (mergedOpts.quiet) {
    return unusedFiles;
  }

  const fileArray = Array.from(unusedFiles) as UnusedFileEntry[];

  if (fileArray.length === 0) {
    console.log(chalk.green.bold("\n✓ No unused files found!"));
    console.log(chalk.green(`${RULE}\n`));
    return unusedFiles;
  }

  if (mergedOpts.dryRun) {
    console.log(chalk.cyan.bold("\n[DRY RUN MODE] No files will be deleted\n"));
  }

  const totalSize = printUnusedFileRows(
    chalk,
    fileArray,
    mergedOpts.table,
    mergedOpts.dryRun,
  );

  console.log(chalk.green(`\n${RULE}`));
  console.log(
    chalk.yellow.bold("Total Size: ") +
      chalk.yellow(`${(totalSize / (1024 * 1024)).toFixed(2)} MB`),
  );
  console.log(
    chalk.magenta.bold("Total Files: ") +
      chalk.magenta(String(fileArray.length)),
  );
  console.log(chalk.green(RULE));

  await maybeExplain(
    "scan",
    {
      unusedFiles: fileArray,
      total: fileArray.length,
      totalBytes: totalSize,
    },
    mergedOpts,
    chalk,
  );

  console.log(chalk.cyan("\n💾 Cache Information"));
  console.log(chalk.cyan(RULE));
  console.log(
    chalk.cyan(
      "Run with --clear-cache or -C to clear the cache for a new scan",
    ),
  );
  console.log(chalk.cyan(RULE));

  if (mergedOpts.dryRun) {
    console.log(
      chalk.cyan(`\n[DRY RUN] Would delete ${unusedFiles.size} file(s)`),
    );
    console.log(chalk.cyan("Run without --dry-run to actually delete files\n"));
  } else {
    if (mergedOpts.autoFix) {
      const listOfFiles = Array.from(unusedFiles, (entry) => {
        const e = entry as UnusedFileEntry;
        return {
          file: e.file,
          size: e.size,
        };
      });
      await moveToTrash(listOfFiles, unusedFiles as Set<TrashableFile>, true);
    } else {
      askDeleteFiles(unusedFiles as Set<TrashableFile>);
    }
  }

  return unusedFiles;
}

export async function undoDeletions(
  chalk: ChalkInstance,
  type: string
): Promise<void> {
  console.log(chalk.yellow(`Undoing deletions for ${type}`));
  printRule(chalk);
  await moveFromTrash(type === "code");
  console.log(chalk.green(`Undone deletions for ${type}`));
  console.log(chalk.green(RULE));
}
