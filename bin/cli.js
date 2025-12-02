#!/usr/bin/env node
const { Command } = require("commander");
const { getFiles, unUsedFiles } = require("../command");

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
  .option("-F, --exclude-file-print <file...>", "Do not Print the excluded files")
  .action(async (path, options) => {
    const imports = await getFiles(path, options);
  });

  program.command("qlean-scan")
  .description("Scan the project for unused files")
  .argument("<path>", "The path to the directory to scan for unused files")
  .option("-e, --exclude-dir <dir...>", "Exclude directories from the scan")
  .option("-f, --exclude-file <file...>", "Exclude files from the scan")
  .option("-F, --exclude-file-print <files...>", "Do not Print the excluded files")
  .action(async (path, options) => {
    const unusedFiles = await unUsedFiles(path, options);
    // console.clear()
    unusedFiles.forEach((file) => {
      console.log(file);
    });
  });
program.parse(process.argv);
