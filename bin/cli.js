#!/usr/bin/env node
const { Command } = require("commander");
const { getFiles, unUsedFiles } = require("../command");
const Table = require('cli-table3')

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
      const { tableImports, tableFiles } = await getFiles(path, options, chalk);
      if(options.table){
        console.log(chalk.yellow('***************** Imported Files *****************'));
        console.log(tableImports.toString());
        console.log(chalk.green('***************** List Files *****************'));
        console.log(tableFiles.toString());
      }
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
    .action(async (path, options) => {
      const unusedFiles = await unUsedFiles(chalk,path, options);
      // console.clear()
      if(options.table){
        const table = new Table({
            head: ['Unused Files'],
            colWidths: [50]
        })
        unusedFiles.forEach(file => {
            table.push([file])
        })
        console.log(table.toString())

      }else {
        unusedFiles.forEach((file) => {
            console.log(chalk.red(file));
          });
      }
    });
  program.parse(process.argv);
})();
