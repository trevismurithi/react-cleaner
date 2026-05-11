#!/usr/bin/env node
const { Command } = require("commander");
const { version: pkgVersion } = require("../package.json");
const {
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
} = require("../controllers/list");
const { getUnusedImages } = require("../controllers/image");
const { init } = require("../controllers/initialize");

async function loadChalk() {
  return (await import("chalk")).default;
}

async function loadOra() {
  return (await import("ora")).default;
}

(async () => {
  const chalk = await loadChalk();
  const ora = await loadOra();

  const program = new Command();

  program
    .name("qleaner")
    .description("A tool to clean up your React code")
    .version(pkgVersion);

  program
    .command("init")
    .description("Initialize the project for Qleaner")
    .action(async () => {
      await init(chalk);
    });

  program
    .command("list")
    .description("List the files used by a dependency")
    .argument("<dependency>", "The dependency to list the files by")
    .option("-t, --table", "Display results in a table format")
    .action(async (dependency, options) => {
      list(ora, chalk, dependency, options);
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
    .action(async (options) => {
      await unusedDependencies(
        chalk,
        options.directory || process.cwd(),
        options,
      );
    });

  program
    .command("summary")
    .description("List all the imports in the project")
    .option("-l, --largest-files", "List the largest files in the project")
    .option("-d, --dependencies", "List the dependencies in the project")
    .action(async (options) => {
      await summary(chalk, options);
    });

  program
    .command("scan")
    .description("Scan the project for unused files")
    .option("-p, --path <path>", "The path to the directory to scan for unused files")
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
    .action(async (options) => {
      await scan(ora, chalk, options);
    });

  program
    .command("image")
    .description("Scan the project for unused images")
    .argument(
      "<directory>",
      "The path to the directory to scan for unused images",
    )
    .argument(
      "<rootPath>",
      "The root path to the project code utilizing the images",
    )
    .option(
      "-e, --exclude-dir-assets <dir...>",
      "Exclude directories from the scan",
    )
    .option(
      "-f, --exclude-file-assets <file...>",
      "Exclude files from the scan",
    )
    .option(
      "-E, --exclude-dir-code <dir...>",
      "Exclude directories from the scan",
    )
    .option("-S, --exclude-file-code <file...>", "Exclude files from the scan")
    .option(
      "-r, --is-root-folder-referenced",
      "Is the root folder referenced in the image path eg /img/a.png where img is the root folder",
    )
    .option(
      "-a, --alias",
      "Is the alias referenced in the image path eg @/assets/images/a.png",
    )
    .option("-t, --table", "Print the results in a table")
    .option(
      "-C, --clear-cache",
      "Clear the cache recommended after making code changes",
    )
    .option(
      "-H, --hide-not-found-images",
      "Hide the images shown in code but not found in the image directory",
    )
    .option(
      "-d, --dry-run",
      "Show what would be deleted without actually deleting (skips prompt)",
    )
    .action(async (directory, rootPath, options) => {
      await getUnusedImages(ora, chalk, directory, rootPath, options);
    });

  program
    .command("exports")
    .description("List the unused exports")
    .option("-f, --fix", "Fix the unused exports")
    .option("-d, --dry-run", "Show what would be deleted without actually deleting (skips prompt)")
    .action(async (options) => {
      await unusedExports(chalk, options);
    });
  program
    .command("prune")
    .description("Prune the unused code (variables, functions, classes)")
    .option("-d, --dry-run", "Show what would be deleted without actually deleting (skips prompt)")
    .action(async (options) => {
      await pruneUnusedCode(chalk, options);
    });
  program
    .command("prune-logs")
    .description(
      "Prune the unused console logs (log, dir, dirxml, table, debug, info, trace)",
    )
    .option("-d, --dry-run", "Show what would be deleted without actually deleting (skips prompt)")
    .action(async (options) => {
      await pruneConsoleLogs(chalk, options);
    });
  program
    .command("undo")
    .description("Undo the deletions")
    .argument(
      "<type>",
      "The type of deletions to undo images or code (images or code)",
    )
    .action(async (type) => {
      await undoDeletions(chalk, type);
    });

  program
    .command("duplicates")
    .description("Check for duplicates in the project")
    .option("-d, --dry-run", "Show what would be deleted without actually deleting (skips prompt)")
    .action(async (options) => {
      await checkForDuplicates(chalk, options);
    });
  program
    .command("tidy")
    .description("Tidy up the project")
    .option("-u, --auto-fix", "Automatically fix the unused files by moving them to the .trash directory")
    .action(async (options) => {
      await tidyUp(ora, chalk, options);
    });
  program.parse(process.argv);
})();
