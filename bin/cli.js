#!/usr/bin/env node
const { Command } = require("commander");
const { summary, scan } = require("../controllers/list");
const { getUnusedImages } = require("../controllers/image");
const { init } = require("../controllers/initialize");

async function loadChalk() {
  return (await import("chalk")).default;
}

async function loadOra(){
  return (await import("ora")).default
}

(async () => {
  const chalk = await loadChalk();
  const ora = await loadOra()

  const program = new Command();

  program
    .name("qleaner")
    .description("A tool to clean up your React code")
    .version("1.0.34");

  program.command("init")
  .description("Initialize the project for Qleaner")
  .action(async () => {
    await init(chalk);
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
      await scan(ora,chalk, path, options);
    });

  program
  .command('image')
  .description("Scan the project for unused images")
  .argument("<directory>", "The path to the directory to scan for unused images")
  .argument("<rootPath>", "The root path to the project code utilizing the images")
  .option("-e, --exclude-dir-assets <dir...>", "Exclude directories from the scan")
  .option("-f, --exclude-file-assets <file...>", "Exclude files from the scan")
  .option("-E, --exclude-dir-code <dir...>", "Exclude directories from the scan")
  .option("-S, --exclude-file-code <file...>", "Exclude files from the scan")
  .option("-r, --is-root-folder-referenced", "Is the root folder referenced in the image path eg /img/a.png where img is the root folder")
  .option("-a, --alias", "Is the alias referenced in the image path eg @/assets/images/a.png")
  .option("-t, --table", "Print the results in a table")
  .option("-C, --clear-cache", "Clear the cache recommended after making code changes")
  .option("-H, --hide-not-found-images", "Hide the images shown in code but not found in the image directory")
  .option("-d, --dry-run", "Show what would be deleted without actually deleting (skips prompt)")
  .action(async (directory, rootPath, options) => {
    await getUnusedImages(ora,chalk, directory, rootPath, options);
  });
  program.parse(process.argv);
})();
