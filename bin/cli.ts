#!/usr/bin/env node
import { Command } from "commander";
import { version as pkgVersion } from "../package.json";
import { init } from "../controllers/initialize";
import {
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
} from "../controllers/list";
import { getUnusedImages } from "../controllers/image";
import { runTimedCommand } from "../utils/utils";
import type { ChalkInstance } from "../types";

/** When omitted, commands resolve paths from the current working directory. */
const DEFAULT_SCAN_PATH = ".";

async function loadChalk(): Promise<ChalkInstance> {
  return (await import("chalk")).default;
}

(async () => {
  const chalk = await loadChalk();

  const program = new Command();

  program
    .name("qleaner")
    .description("A tool to clean up your React code")
    .version(pkgVersion);

  program
    .command("init")
    .description("Initialize the project for Qleaner (auto-detects settings)")
    .argument(
      "[projectPath]",
      "Project directory to initialize (default: cwd)",
      DEFAULT_SCAN_PATH,
    )
    .option("-f, --force", "Overwrite an existing qleaner.config.json")
    .action(async (projectPath: string, options: { force?: boolean }) => {
      await runTimedCommand(chalk, "init", () =>
        init({ force: options.force, path: projectPath })
      );
    });

  program
    .command("list")
    .description("List the files used by a dependency")
    .argument("<dependency>", "The dependency to list the files by")
    .option("-t, --table", "Display results in a table format")
    .action(async (dependency: string, options: Record<string, unknown>) => {
      await runTimedCommand(chalk, "list", () =>
        list(chalk, dependency, options)
      );
    });

  program
    .command("dep")
    .description("List the unused dependencies")
    .option(
      "-d, --directory <directory>",
      "The directory to list the unused dependencies from",
    )
    .option("-t, --table", "Display results in a table format")
    .option("-u, --uninstall", "Uninstall the unused dependencies")
    .action(async (options: { directory?: string; table?: boolean; uninstall?: boolean }) => {
      await runTimedCommand(chalk, "dep", () =>
        unusedDependencies(
          chalk,
          options.directory || process.cwd(),
          options,
        )
      );
    });

  program
    .command("summary")
    .description("List all the imports in the project")
    .option("-l, --largest-files", "List the largest files in the project")
    .option("-d, --dependencies", "List the dependencies in the project")
    .action(async (options: Record<string, unknown>) => {
      await runTimedCommand(chalk, "summary", () => summary(chalk, options));
    });

  program
    .command("scan")
    .description("Scan the project for unused files")
    .argument(
      "[pathToScan]",
      "Directory to scan for unused files",
      DEFAULT_SCAN_PATH,
    )
    .option("-e, --exclude-dir <dir...>", "Exclude directories from the scan")
    .option("-f, --exclude-file <file...>", "Exclude files from the scan")
    .option(
      "-F, --exclude-file-print <files...>",
      "Scan but don't print the excluded files",
    )
    .option(
      "-x, --exclude-extensions <extensions...>",
      "Exclude file extensions from the scan like .test.tsx, .test.ts, .test.js, .test.jsx",
    )
    .option("-t, --table", "Print the results in a table")
    .option(
      "-d, --dry-run",
      "Show what would be deleted without actually deleting (skips prompt)",
    )
    .option("-u, --auto-fix", "Automatically fix the unused files by moving them to the .trash directory")
    .option(
      "-C, --clear-cache",
      "Clear the cache recommended after making code changes",
    )
    .action(async (pathToScan: string, options: Record<string, unknown>) => {
      await runTimedCommand(chalk, "scan", () =>
        scan(chalk, pathToScan, options)
      );
    });

  program
    .command("image")
    .description("Scan the project for unused images")
    .argument(
      "[projectPath]",
      "Project directory to scan (default: cwd)",
      DEFAULT_SCAN_PATH,
    )
    .option(
      "-u, --auto-prune",
      "Automatically move unused images to the .trash directory (no prompt)",
    )
    .option(
      "-T, --size-threshold-mb <megabytes>",
      "Highlight unused images larger than this size in MB (display only)",
    )
    .option(
      "-e, --exclude-dir-assets <dir...>",
      "Exclude directories from the scan",
    )
    .option(
      "-F, --exclude-file-assets <file...>",
      "Exclude files from the scan",
    )
    .option(
      "-E, --exclude-dir-code <dir...>",
      "Exclude directories from the scan",
    )
    .option("-S, --exclude-file-code <file...>", "Exclude files from the scan")
    .option("-t, --table", "Print the results in a table")
    .option(
      "-C, --clear-cache",
      "Clear the cache recommended after making code changes",
    )
    .option(
      "-H, --hide-not-found-images",
      "Hide the images shown in code but not found on disk",
    )
    .option(
      "-d, --dry-run",
      "Show what would be deleted without actually deleting (skips prompt)",
    )
    .action(async (projectPath: string, options: Record<string, unknown>) => {
      await runTimedCommand(chalk, "image", () =>
        getUnusedImages(chalk, projectPath, options)
      );
    });

  program
    .command("exports")
    .description("List or remove unused exports (uses graph cache; run scan if cache is missing)")
    .argument(
      "[pathToScan]",
      "Project directory to analyze",
      DEFAULT_SCAN_PATH,
    )
    .option("-r, --fresh-scan", "Rebuild graph cache before analyzing unused exports")
    .option("-f, --fix", "Remove unused exports from source files")
    .option(
      "-d, --dry-run",
      "Only print how many unused exports were found (no table unless --report)",
    )
    .option(
      "--report",
      "Print a table of unreferenced exports (export name and file); works with or without --dry-run",
    )
    .action(async (pathToScan: string, options: Record<string, unknown>) => {
      await runTimedCommand(chalk, "exports", () =>
        unusedExports(chalk, pathToScan, {
          ...options,
          message: "Removing unreferenced exports",
        })
      );
    });

  program
    .command("prune")
    .description("Prune the unused code (variables, functions, classes)")
    .argument(
      "[pathToScan]",
      "Directory to scan for unused code",
      DEFAULT_SCAN_PATH,
    )
    .option("-d, --dry-run", "Show what would be deleted without actually deleting (skips prompt)")
    .option(
      "-r, --report",
      "Print a table of unused variables, functions, and classes (file, line, name, kind)",
    )
    .action(async (pathToScan: string, options: Record<string, unknown>) => {
      await runTimedCommand(chalk, "prune", () =>
        pruneUnusedCode(chalk, pathToScan, {
          ...options,
          message: "Removing unused code",
        })
      );
    });

  program
    .command("prune-logs")
    .description(
      "Prune the unused console logs (log, dir, dirxml, table, debug, info, trace)",
    )
    .argument(
      "[pathToScan]",
      "Directory to scan for console log calls",
      DEFAULT_SCAN_PATH,
    )
    .option("-d, --dry-run", "Show what would be deleted without actually deleting (skips prompt)")
    .option(
      "--list-risk-categories",
      "Print risk tier docs (category headings + pattern file paths); then exit (no scan)",
    )
    .option(
      "-i, --list-risk-categories-info",
      "Same as --list-risk-categories (short alias); then exit (no scan)",
    )
    .action(async (pathToScan: string, options: Record<string, unknown>) => {
      await runTimedCommand(chalk, "prune-logs", () =>
        pruneConsoleLogs(chalk, pathToScan, {
          ...options,
          message: "Removing console logs",
        })
      );
    });

  program
    .command("undo")
    .description("Undo the deletions")
    .argument(
      "<type>",
      "The type of deletions to undo images or code (images or code)",
    )
    .action(async (type: string) => {
      await runTimedCommand(chalk, "undo", () => undoDeletions(chalk, type));
    });

  program
    .command("duplicates")
    .description("Find and optionally remove duplicate functions/classes in scanned files")
    .argument(
      "[pathToScan]",
      "Directory to scan (same glob roots as scan / prune)",
      DEFAULT_SCAN_PATH,
    )
    .option(
      "-d, --dry-run",
      "Report duplicates only; do not modify files",
    )
    .option(
      "-r, --report",
      "Print a table of duplicate functions and classes (file, line, name, kind)",
    )
    .action(async (pathToScan: string, options: Record<string, unknown>) => {
      await runTimedCommand(chalk, "duplicates", () =>
        checkForDuplicates(chalk, pathToScan, {
          ...options,
          message: "Removing duplicate code",
        })
      );
    });

  program
    .command("tidy")
    .description("Tidy up the project")
    .argument(
      "[pathToScan]",
      "Project directory for cleanup (logs, dead code, duplicates, exports)",
      DEFAULT_SCAN_PATH,
    )
    .option("-u, --auto-fix", "Automatically fix the unused files by moving them to the .trash directory")
    .option(
      "-r, --report",
      "During each tidy step’s dry-run, print detail tables (console log tiers, unused code, duplicates, exports)",
    )
    .option(
      "--list-risk-categories",
      "Console-log step only: per-tier hit tables when dry-run returns foundByRisk (also on when -r is set)",
    )
    .option(
      "-i, --list-risk-categories-info",
      "Print console-log risk tier docs (category index); tidy continues with remaining steps",
    )
    .action(async (pathToScan: string, options: Record<string, unknown>) => {
      await runTimedCommand(chalk, "tidy", () =>
        tidyUp(chalk, pathToScan, options)
      );
    });

  program.parse(process.argv);
})();
