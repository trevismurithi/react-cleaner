const { getFiles, unUsedFiles } = require("../command");
const Table = require('cli-table3');
const { askDeleteFiles } = require("../utils/utils");


async function list(chalk, path, options) {
    const { tableImports, tableFiles } = await getFiles(path, options, chalk);
    if(options.table){
      console.log(chalk.yellow('***************** Imported Files *****************'));
      console.log(tableImports.toString());
      console.log(chalk.green('***************** List Files *****************'));
      console.log(tableFiles.toString());
    }
}

async function scan(ora, chalk, path, options) {
    const unusedFiles = await unUsedFiles(ora, chalk,path, options);
    // console.clear()
    let totalSize = 0;
    
    if (options.dryRun) {
      console.log(chalk.cyan('\n[DRY RUN MODE] No files will be deleted\n'));
    }
    
    if(options.table){
      const table = new Table({
          head: options.dryRun ? ['Unused Files (Would Delete)', 'Size'] : ['Unused Files', 'Size'],
          colWidths: [100, 10]
      })

      totalSize = 0;
      for (const file of unusedFiles) {
        table.push([file.file, (file.size/(1024*1024)).toFixed(2) + ' MB'])
        totalSize += file.size
      }
      console.log(table.toString())

    }else {
      totalSize = 0;
      for (const file of unusedFiles) {
        console.log('file---->', chalk.blue(file.file) + ' - ' + chalk.green((file.size/(1024*1024)).toFixed(2) + ' MB'));
        totalSize += file.size;
      }
    }
    
    // inform about the cache, that already scanned files were skipped
    // Everytime they need a new scan, they should clear the cache
    console.log('totalSize---->', chalk.yellow((totalSize/(1024*1024)).toFixed(2)) + ' MB');
    console.log(chalk.cyan('***************** Cache *****************'));
    console.log(chalk.cyan('Run with --clear-cache or -C to clear the cache for a new scan'));
    console.log(chalk.cyan('***************** Cache *****************'));
    if (options.dryRun && unusedFiles.size > 0) {
      console.log(chalk.cyan(`\n[DRY RUN] Would delete ${unusedFiles.size} file(s)`));
      console.log(chalk.cyan('Run without --dry-run to actually delete files\n'));
    } else if (!options.dryRun && unusedFiles.size > 0) {
      askDeleteFiles(Array.from(unusedFiles.keys()));
    }
}

module.exports = {
  list,
  scan
};