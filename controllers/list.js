const { unUsedFiles } = require("../command");
const { hydrateGraph } = require("../utils/graphUtils");
const { findUnusedExports } = require("./code");
const Table = require("cli-table3");
const {
  askDeleteFiles,
  loadTSConfig,
  moveFromTrash,
  uninstallDependency,
  combineValues,
  updateFileAssociatedStats,
  moveToTrash,
  logStage,
} = require("../utils/utils");
const fs = require("fs");
const path = require("path");
const {
  summarizeAll,
  getTop10LargestFiles,
  dependenciesSummary,
  formatFilePath,
} = require("./summary");
const { query, unusedDependencies: findUnusedDeps } = require("./query");
const {
  editFile,
  pruneInternal,
  nukeConsoleLogs,
  deduplicateLogic,
} = require("../utils/editFile");
const {
  CONSOLE_LOG_HIGH_RISK_CATEGORY_LABELS,
} = require("../utils/consoleLogHighRiskPatterns");
const {
  CONSOLE_LOG_MEDIUM_RISK_CATEGORY_LABELS,
} = require("../utils/consoleLogMediumRiskPatterns");
const { buildContentPaths } = require("../utils/pathBuilder");
const fg = require("fast-glob");

const RULE = "════════════════════════════════════════════════";
const CACHE_FILE = "unused-check-cache.json";
const TABLE_STYLE = { head: [], border: [] };

function cachePath() {
  return path.join(process.cwd(), CACHE_FILE);
}

function printRule(chalk, color = "yellow") {
  console.log(chalk[color](RULE));
}

/** Load and validate `parentGraph.graph`; log on failure. */
function loadHydratedGraph(chalk) {
  const file = cachePath();
  if (!fs.existsSync(file)) {
    console.log(
      chalk.red(
        '⚠️  Cache file not found. Please run "qleaner scan" first to generate the cache.',
      ),
    );
    return null;
  }
  let cache;
  try {
    cache = JSON.parse(fs.readFileSync(file, "utf8"));
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

function printSurgicalSummary(chalk, heading, stats) {
  console.log(chalk.yellow(`${heading}:`));
  printRule(chalk);
  console.log(chalk.yellow(`Total items removed: ${stats.totalItemsRemoved}`));
  console.log(chalk.yellow(`Total lines removed: ${stats.totalLinesRemoved}`));
  console.log(chalk.yellow(`Total bytes saved: ${stats.bytesSaved}`));
  console.log(chalk.yellow(`Total files modified: ${stats.filesModified}`));
  printRule(chalk);
}

/** Numeric total from a dry-run result (`nukeConsoleLogs` → `{ total, highRisk, mediumRisk, lowRisk, foundByRisk? }`). */
function dryRunItemTotal(result) {
  if (
    result &&
    typeof result === "object" &&
    typeof result.total === "number"
  ) {
    return result.total;
  }
  return typeof result === "number" ? result : 0;
}

/** Max rows per risk tier when printing `foundByRisk` (dry-run console log pass). */
const CONSOLE_LOG_DRY_RUN_PRINT_MAX_PER_TIER = 100;

/** Max rows when printing `prune` dry-run report (`-r` / `--report`). */
const PRUNE_INTERNAL_DRY_RUN_PRINT_MAX = 500;

function truncateConsolePreview(text, maxLen = 90) {
  const s = String(text == null ? "" : text)
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= maxLen) {
    return s;
  }
  return `${s.slice(0, maxLen)}…`;
}

/**
 * @param {import("chalk").Chalk} chalk
 * @param {{ high?: unknown[], medium?: unknown[], low?: unknown[] }} foundByRisk
 */
function printConsoleLogDryRunFoundByRisk(chalk, foundByRisk) {
  if (!foundByRisk || typeof foundByRisk !== "object") {
    return;
  }

  const tiers = [
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

/**
 * @param {import("chalk").Chalk} chalk
 * @param {Array<{ file?: string, line?: number, name?: string, kind?: string }>} found
 * @param {boolean} [isDryRun]
 * @param {string} [subject]
 */
function printFoundItemsReport(
  chalk,
  found,
  isDryRun = true,
  subject = "Unused code",
) {
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

/**
 * @param {import("chalk").Chalk} chalk
 * @param {Array<{ file?: string, name?: string }>} found
 * @param {boolean} [isDryRun]
 */
function printUnusedExportsReport(chalk, found, isDryRun = true) {
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

/** @param {Map<string, string>} unUsedExportsWithPath export name → file path */
function buildUnusedExportsFound(unUsedExportsWithPath) {
  const found = [];
  for (const [name, file] of unUsedExportsWithPath.entries()) {
    found.push({ file, name, kind: "export" });
  }
  return found;
}

async function runSurgicalPass(chalk, pathToScan, options, transform, labels) {
  const files = await getConfig(pathToScan);
  const stats = await transform(files, options.dryRun, chalk, options.message);
  if (options.dryRun) {
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
    console.log(chalk.yellow(`${labels.dryPrefix}: ${detail}`));
    if (
      stats &&
      typeof stats === "object" &&
      stats.foundByRisk &&
      options.listRiskCategories
    ) {
      printConsoleLogDryRunFoundByRisk(chalk, stats.foundByRisk);
    }
    if (options.report) {
      maybePrintSurgicalFoundReport(chalk, stats, true);
    }
    return stats;
  }

  const statsForSave = stripFoundFromStats(stats);
  await updateFileAssociatedStats(new Date().toISOString(), statsForSave);
  printSurgicalSummary(chalk, labels.summaryHeading, statsForSave);
  if (options.report) {
    maybePrintSurgicalFoundReport(chalk, stats, false);
  }
}

/** @param {unknown} stats */
function stripFoundFromStats(stats) {
  if (!stats || typeof stats !== "object" || !Array.isArray(stats.found)) {
    return stats;
  }
  const copy = { ...stats };
  delete copy.found;
  return copy;
}

/**
 * @param {import("chalk").Chalk} chalk
 * @param {unknown} stats
 * @param {boolean} isDryRun
 */
function maybePrintSurgicalFoundReport(chalk, stats, isDryRun) {
  if (
    !stats ||
    typeof stats !== "object" ||
    !Array.isArray(stats.found) ||
    stats.found.length === 0
  ) {
    return;
  }
  const first = stats.found[0];
  if (first && first.kind === "export") {
    printUnusedExportsReport(chalk, stats.found, isDryRun);
    return;
  }
  const subject =
    first && (first.kind === "function" || first.kind === "class")
      ? "Duplicate code"
      : "Unused code";
  printFoundItemsReport(chalk, stats.found, isDryRun, subject);
}

async function getConfig(pathToScan) {
  const configPath = path.join(process.cwd(), "qleaner.config.json");
  let config = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
  return fg(buildContentPaths(pathToScan, config));
}

function newTable(chalk, heads, colWidths) {
  return new Table({
    head: heads.map((h) => chalk.cyan(h)),
    colWidths,
    style: TABLE_STYLE,
  });
}

function printLinesOrTable(chalk, rows, useTable, singleColumnLabel) {
  if (useTable) {
    const table = newTable(chalk, [singleColumnLabel], [100]);
    rows.forEach((row) => table.push([chalk.white(row)]));
    console.log(table.toString());
  } else {
    rows.forEach((row) => console.log(chalk.yellow(row)));
  }
}

async function tidyUp(chalk, pathToScan, options = {}) {
  const { autoFix } = options;
  const report = Boolean(options.report);
  const listRiskCategories =
    Boolean(options.listRiskCategories) || report;

  logStage(chalk, "Start Qleaner tidy");

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
        }),
      fix: () =>
        pruneConsoleLogs(chalk, pathToScan, {
          message: "Removing console logs",
          report,
          listRiskCategories,
          listRiskCategoriesInfo: options.listRiskCategoriesInfo,
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
        }),
      fix: () =>
        pruneUnusedCode(chalk, pathToScan, {
          message: "Removing unused code",
          report,
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
        }),
      fix: () =>
        checkForDuplicates(chalk, pathToScan, {
          message: "Removing duplicate code",
          report,
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
        }),
      fix: () =>
        unusedExports(chalk, pathToScan, {
          fix: true,
          message: "Removing unreferenced exports",
          report,
        }),
    },
  ];

  for (const step of steps) {
    if (report && step.reportTitle) {
      printRule(chalk, "cyan");
      console.log(chalk.cyan.bold(`Tidy — ${step.reportTitle}`));
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
    await scan(chalk, pathToScan, { dryRun: true, clearCache: false });
  }

  logStage(chalk, "Tidy completed", "done");
}

async function checkForDuplicates(chalk, pathToScan, options = {}) {
  return runSurgicalPass(chalk, pathToScan, options, deduplicateLogic, {
    dryPrefix: "Total duplicates found",
    summaryHeading: "Check for duplicates",
  });
}

function printConsoleLogRiskCategoryReference(chalk) {
  const highPath = require.resolve("../utils/consoleLogHighRiskPatterns.js");
  const mediumPath =
    require.resolve("../utils/consoleLogMediumRiskPatterns.js");
  const tierPath = require.resolve("../utils/editFile.js");

  printRule(chalk, "cyan");
  console.log(chalk.cyan.bold("Console log risk tiers (dry-run & tidy)"));
  console.log(
    chalk.gray(
      "Each removable console.debug/log/info/… call is classified from its argument source text: high → medium → low.",
    ),
  );
  printRule(chalk, "cyan");

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
  printRule(chalk, "cyan");
}

async function pruneConsoleLogs(chalk, pathToScan, options = {}) {
  if (options.listRiskCategoriesInfo) {
    printConsoleLogRiskCategoryReference(chalk);
    return;
  }
  return runSurgicalPass(chalk, pathToScan, options, nukeConsoleLogs, {
    dryPrefix: "Total console logs found",
    summaryHeading: "Prune console logs",
  });
}

async function pruneUnusedCode(chalk, pathToScan, options = {}) {
  return runSurgicalPass(chalk, pathToScan, options, pruneInternal, {
    dryPrefix: "Total unused code found",
    summaryHeading: "Prune internal unused code",
  });
}

async function unusedExports(chalk, pathToScan, options = {}) {
  await scan(chalk, pathToScan, {
    dryRun: true,
    clearCache: Boolean(options.freshScan),
  });
  const { unUsedExportsWithPath, fileAssociated } =
    await findUnusedExports(chalk);
  const found = buildUnusedExportsFound(unUsedExportsWithPath);
  const listToRemove = combineValues(unUsedExportsWithPath);

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

  if (!options.fix || options.report) {
    printUnusedExportsReport(chalk, found, true);
  }

  if (options.fix) {
    const stats = await editFile(
      listToRemove,
      fileAssociated,
      chalk,
      options.message,
    );
    await updateFileAssociatedStats(new Date().toISOString(), stats);
    if (options.report) {
      printUnusedExportsReport(chalk, found, false);
    }
  }

  console.log(chalk.yellow(`Total unused exports: ${found.length}`));
  return found.length;
}

async function list(chalk, dependency, options = {}) {
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

async function unusedDependencies(
  chalk,
  directoryPath = process.cwd(),
  options = {},
) {
  const packageJsonPath = path.join(directoryPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    console.log(chalk.red("⚠️  Package.json not found."));
    return;
  }

  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
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

async function summary(chalk, options) {
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
  } else if (options.dependencies) {
    dependenciesSummary(chalk);
  } else {
    summarizeAll(chalk);
  }
}

function resolveScanPathConfig(pathToScan, options, chalk) {
  let pathConfig = {};
  const configPath = path.join(process.cwd(), "qleaner.config.json");
  if (!fs.existsSync(configPath)) {
    return { options, pathConfig };
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const merged = { ...config, ...options };

  if (config.paths && Object.keys(config.paths).length > 0) {
    pathConfig = config.paths;
  } else if (config.codeAlias) {
    const loaded = loadTSConfig(pathToScan, config.codeAlias).paths;
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

function printUnusedFileRows(chalk, fileArray, useTable, dryRun) {
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

async function scan(chalk, pathToScan, options) {
  const { options: mergedOpts, pathConfig } = resolveScanPathConfig(
    pathToScan,
    options,
    chalk,
  );

  const unusedFiles = await unUsedFiles(
    chalk,
    pathToScan,
    pathConfig,
    mergedOpts,
  );

  const fileArray = Array.from(unusedFiles);

  if (fileArray.length === 0) {
    console.log(chalk.green.bold("\n✓ No unused files found!"));
    console.log(chalk.green(`${RULE}\n`));
    return;
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
      const listOfFiles = Array.from(unusedFiles, (entry) => ({
        file: entry.file,
        size: entry.size,
      }));
      await moveToTrash(listOfFiles, unusedFiles, true);
    } else {
      askDeleteFiles(unusedFiles);
    }
  }
}

async function undoDeletions(chalk, type) {
  console.log(chalk.yellow(`Undoing deletions for ${type}`));
  printRule(chalk);
  await moveFromTrash(type === "code");
  console.log(chalk.green(`Undone deletions for ${type}`));
  console.log(chalk.green(RULE));
}

module.exports = {
  resolveScanPathConfig,
  summary,
  scan,
  list,
  unusedDependencies,
  undoDeletions,
  unusedExports,
  pruneUnusedCode,
  pruneConsoleLogs,
  checkForDuplicates,
  tidyUp,
};
