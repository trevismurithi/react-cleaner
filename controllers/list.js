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
      chalk.red('⚠️  Error reading cache file. Please run "qleaner scan" again.'),
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

async function runSurgicalPass(chalk, pathToScan, options, transform, labels) {
  const files = await getConfig(pathToScan);
  const stats = await transform(
    files,
    options.dryRun,
    chalk,
    options.message,
  );
  if (options.dryRun) {
    console.log(chalk.yellow(`${labels.dryPrefix}: ${stats}`));
    return stats;
  }
  await updateFileAssociatedStats(new Date().toISOString(), stats);
  printSurgicalSummary(chalk, labels.summaryHeading, stats);
}

async function getConfig(pathToScan) {
  const configPath = path.join(pathToScan, "qleaner.config.json");
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

async function tidyUp(ora, chalk, pathToScan, options = {}) {
  const { autoFix } = options;
  const spinner = ora("🔍 Tidying up the project...").start();

  const steps = [
    {
      checkLabel: "🔍 Checking for console logs...",
      fixLabel: "🔍 Removing console logs...",
      done: "Prune console logs completed",
      dry: () =>
        pruneConsoleLogs(chalk, pathToScan, {
          dryRun: true,
          message: "Checking for console logs",
        }),
      fix: () =>
        pruneConsoleLogs(chalk, pathToScan, { message: "Removing console logs" }),
    },
    {
      checkLabel: "🔍 Checking for unused code...",
      fixLabel: "🔍 Removing unused code...",
      done: "Prune unused code completed",
      dry: () =>
        pruneUnusedCode(chalk, pathToScan, {
          dryRun: true,
          message: "Checking for unused code",
        }),
      fix: () =>
        pruneUnusedCode(chalk, pathToScan, { message: "Removing unused code" }),
    },
    {
      checkLabel: "🔍 Checking for duplicate code...",
      fixLabel: "🔍 Removing duplicate code...",
      done: "Remove duplicate code completed",
      dry: () =>
        checkForDuplicates(chalk, pathToScan, {
          dryRun: true,
          message: "Checking for duplicate code",
        }),
      fix: () =>
        checkForDuplicates(chalk, pathToScan, {
          message: "Removing duplicate code",
        }),
    },
    {
      checkLabel: "🔍 Checking for unreferenced exports...",
      fixLabel: "🔍 Removing unreferenced exports...",
      done: "Remove unreferenced exports completed",
      dry: () =>
        unusedExports(ora, chalk, pathToScan, {
          dryRun: true,
          message: "Checking for unreferenced exports",
        }),
      fix: () =>
        unusedExports(ora, chalk, pathToScan, {
          fix: true,
          message: "Removing unreferenced exports",
        }),
    },
  ];

  for (const step of steps) {
    spinner.text = step.checkLabel;
    const count = await step.dry();
    if (count > 0 && autoFix) {
      spinner.text = step.fixLabel;
      await step.fix();
      spinner.succeed(step.done);
    }
  }

  if (autoFix) {
    await scan(ora, chalk, pathToScan, { dryRun: true, clearCache: false });
    spinner.succeed("Tidy up completed");
  }
  spinner.succeed("Tidy up completed");
}

async function checkForDuplicates(chalk, pathToScan, options = {}) {
  return runSurgicalPass(chalk, pathToScan, options, deduplicateLogic, {
    dryPrefix: "Total duplicates found",
    summaryHeading: "Check for duplicates",
  });
}

async function pruneConsoleLogs(chalk, pathToScan, options = {}) {
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

async function unusedExports(ora, chalk, pathToScan, options = {}) {
  await scan(ora, chalk, pathToScan, {
    dryRun: true,
    clearCache: Boolean(options.freshScan),
  });
  const { unUsedExportsWithPath, fileAssociated } = await findUnusedExports(chalk);

  if (options.dryRun) {
    console.log(
      chalk.yellow(`Total unused exports found: ${unUsedExportsWithPath.size}`),
    );
    return unUsedExportsWithPath.size;
  }

  if (unUsedExportsWithPath.size === 0) {
    console.log(
      chalk.green("✓ No unused exports found. All exports are in use."),
    );
    return;
  }

  const table = newTable(
    chalk,
    ["Unreferenced Exports", "File Path"],
    [100, 100],
  );
  const listToRemove = combineValues(unUsedExportsWithPath);
  listToRemove.forEach((exportName, filePath) => {
    table.push([
      chalk.white(exportName),
      chalk.white(formatFilePath(filePath, 95)),
    ]);
  });
  console.log(table.toString());
  printRule(chalk);

  if (options.fix) {
    const stats = await editFile(
      listToRemove,
      fileAssociated,
      chalk,
      options.message,
    );
    await updateFileAssociatedStats(new Date().toISOString(), stats);
  }

  console.log(
    chalk.yellow(`Total unused exports: ${unUsedExportsWithPath.size}`),
  );
}

async function list(ora, chalk, dependency, options = {}) {
  const graph = loadHydratedGraph(chalk);
  if (!graph) return;

  const spinner = ora("🔍 Loading graph from cache...").start();
  await new Promise((resolve) => setTimeout(resolve, 500));
  spinner.text = "🔍 Querying files by dependency...";
  const filesSet = query(graph, dependency);
  await new Promise((resolve) => setTimeout(resolve, 500));
  spinner.succeed("Query completed");

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

async function scan(ora, chalk, pathToScan, options) {
  const { options: mergedOpts, pathConfig } = resolveScanPathConfig(
    pathToScan,
    options,
    chalk,
  );

  const unusedFiles = await unUsedFiles(
    ora,
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
