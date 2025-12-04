#!/usr/bin/env node
const { Command } = require("commander");
const { list, scan } = require("../controllers/list");


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
    .action(async (path, options) => {
      await scan(chalk, path, options);
    });

  program
  .command('qlean-image')
  .description("Scan the project for unused images")
  .argument("<path>", "The path to the directory to scan for unused images")
  .option("-e, --exclude-dir <dir...>", "Exclude directories from the scan")
  .option("-f, --exclude-file <file...>", "Exclude files from the scan")
  .option(
    "-F, --exclude-file-print <files...>",
    "Scan but don't print the excluded files"
  )
  .option("-t, --table", "Print the results in a table")
  .action(async (path, options) => {

  });
  program.parse(process.argv);
})();
