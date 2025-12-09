#!/usr/bin/env node
const { Command } = require("commander");
const { list, scan } = require("../controllers/list");
const { clearCache } = require("../utils/cache");
const { getUnusedImages } = require("../controllers/image");

async function loadChalk() {
  return (await import("chalk")).default;
}

(async () => {
  const chalk = await loadChalk();

  const program = new Command();

  program
    .name("qleaner")
    .description("A tool to clean up your React code")
    .version("1.0.0");

  program
    .command("qlean-list")
    .description("List all the imports in the project")
    .argument("<path>", "The path to the directory to scan for imports")
    .option("-l, --list-files", "List all the files in the project")
    .option("-i, --list-imports", "List all the imports in the project")
    .option("-e, --exclude-dir <dir...>", "Exclude directories from the scan")
    .option("-f, --exclude-file <file...>", "Exclude files from the scan")
    .option(
      "-F, --exclude-file-print <file...>",
      "Do not Print the excluded files"
    )
    .option("-t, --table", "Print the results in a table")
    .action(async (path, options) => {
      await list(chalk, path, options);
    });

  program
    .command("qlean-scan")
    .description("Scan the project for unused files")
    .argument("<path>", "The path to the directory to scan for unused files")
    .option("-e, --exclude-dir <dir...>", "Exclude directories from the scan")
    .option("-f, --exclude-file <file...>", "Exclude files from the scan")
    .option(
      "-F, --exclude-file-print <files...>",
      "Scan but don't print the excluded files"
    )
    .option("-t, --table", "Print the results in a table")
    .option("-d, --dry-run", "Show what would be deleted without actually deleting (skips prompt)")
    .option("-C, --clear-cache", "Clear the cache recommended after making code changes")
    .action(async (path, options) => {
      if(options.clearCache) {
        clearCache(process.cwd());
        console.log(chalk.green('✓ Cache cleared successfully'));
      }
      await scan(chalk, path, options);
    });

  program
  .command('qlean-image')
  .description("Scan the project for unused images")
  .argument("<directory>", "The path to the directory to scan for unused images")
  .argument("<rootPath>", "The root path to the project code utilizing the images")
  .option("-e, --exclude-dir-assets <dir...>", "Exclude directories from the scan")
  .option("-f, --exclude-file-asset <file...>", "Exclude files from the scan")
  .option(
    "-F, --exclude-file-print-asset <files...>",
    "Scan but don't print the excluded files"
  )
  .option("-E, --exclude-dir-code <dir...>", "Exclude directories from the scan")
  .option("-S, --exclude-file-code <file...>", "Exclude files from the scan")
  .option(
    "-P, --exclude-file-print-code <files...>",
    "Scan but don't print the excluded files"
  )
  .option("-t, --table", "Print the results in a table")
  .option("-d, --dry-run", "Show what would be deleted without actually deleting (skips prompt)")
  // .option("-C, --clear-cache", "Clear the cache recommended after making code changes")
  .action(async (directory, rootPath, options) => {
    await getUnusedImages(chalk, directory, rootPath, options);
  });
  program.parse(process.argv);
})();
