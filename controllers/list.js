const { unUsedFiles } = require("../command");
const Table = require('cli-table3');
const { askDeleteFiles } = require("../utils/utils");
const fs = require('fs');
const path = require('path');
const { summarizeAll, getTop10LargestFiles, dependenciesSummary, formatFilePath } = require("./summary");

async function summary(chalk, options) {
    console.log(chalk.yellow('⚠️  Note: Make sure to run a new scan before viewing the summary for accurate results.'));
    console.log(chalk.yellow('   Use the scan command to update the cache with the latest project state.\n'));
    if(options.largestFiles){
      getTop10LargestFiles(chalk);
    }else if(options.dependencies){
      dependenciesSummary(chalk);
    }else{
      summarizeAll(chalk);
    }
}

async function scan(ora, chalk, filePath, options) {
    // check if qleaner.config.json exists
    if (fs.existsSync(path.join(process.cwd(), "qleaner.config.json"))) {
      const config = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "qleaner.config.json"), "utf8")
      );
      options = {
        ...config,
        ...options,
      };
    }
    // read qleaner.config.json
    const unusedFiles = await unUsedFiles(ora, chalk,filePath, options);
    
    let totalSize = 0;
    const fileArray = Array.from(unusedFiles.values());
    
    if (fileArray.length === 0) {
      console.log(chalk.green.bold("\n✓ No unused files found!"));
      console.log(chalk.green("════════════════════════════════════════════════\n"));
      return;
    }

    if (options.dryRun) {
      console.log(chalk.cyan.bold('\n[DRY RUN MODE] No files will be deleted\n'));
    }
    
    if(options.table){
      const table = new Table({
          head: options.dryRun 
            ? [chalk.cyan('Unused Files (Would Delete)'), chalk.cyan('Size')] 
            : [chalk.cyan('Unused Files'), chalk.cyan('Size')],
          colWidths: [90, 15],
          style: { head: [], border: [] }
      })

      totalSize = 0;
      for (const file of fileArray) {
        table.push([
          chalk.white(formatFilePath(file.file, 85)),
          chalk.yellow((file.size/(1024)).toFixed(2) + ' KB')
        ]);
        totalSize += file.size;
      }
      console.log(table.toString());

    }else {
      totalSize = 0;
      for (const file of fileArray) {
        console.log(
          chalk.white('📄 ') + 
          chalk.blue(formatFilePath(file.file, 85)) + 
          ' - ' + 
          chalk.yellow((file.size/(1024)).toFixed(2) + ' KB')
        );
        totalSize += file.size;
      }
    }
    
    // Summary section
    console.log(chalk.green("\n════════════════════════════════════════════════"));
    console.log(
      chalk.yellow.bold("Total Size: ") + 
      chalk.yellow((totalSize/(1024*1024)).toFixed(2) + ' MB')
    );
    console.log(
      chalk.magenta.bold("Total Files: ") + 
      chalk.magenta(fileArray.length.toString())
    );
    console.log(chalk.green("════════════════════════════════════════════════"));
    
    // Cache information
    console.log(chalk.cyan('\n💾 Cache Information'));
    console.log(chalk.cyan('════════════════════════════════════════════════'));
    console.log(chalk.cyan('Run with --clear-cache or -C to clear the cache for a new scan'));
    console.log(chalk.cyan('════════════════════════════════════════════════'));
    
    if (options.dryRun && unusedFiles.size > 0) {
      console.log(chalk.cyan(`\n[DRY RUN] Would delete ${unusedFiles.size} file(s)`));
      console.log(chalk.cyan('Run without --dry-run to actually delete files\n'));
    } else if (!options.dryRun && unusedFiles.size > 0) {
      askDeleteFiles(unusedFiles);
    }
}

module.exports = {
  summary,
  scan
};