const { getFiles, unUsedFiles } = require("../command");
const Table = require('cli-table3');
const askDeleteFiles = require("../utils/utils");


async function list(chalk, path, options) {
    const { tableImports, tableFiles } = await getFiles(path, options, chalk);
    if(options.table){
      console.log(chalk.yellow('***************** Imported Files *****************'));
      console.log(tableImports.toString());
      console.log(chalk.green('***************** List Files *****************'));
      console.log(tableFiles.toString());
    }
}

async function scan(chalk, path, options) {
    const unusedFiles = await unUsedFiles(chalk,path, options);
    // console.clear()
    
    if (options.dryRun) {
      console.log(chalk.cyan('\n[DRY RUN MODE] No files will be deleted\n'));
    }
    
    if(options.table){
      const table = new Table({
          head: options.dryRun ? ['Unused Files (Would Delete)'] : ['Unused Files'],
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
    
    if (options.dryRun && unusedFiles.length > 0) {
      console.log(chalk.cyan(`\n[DRY RUN] Would delete ${unusedFiles.length} file(s)`));
      console.log(chalk.cyan('Run without --dry-run to actually delete files\n'));
    } else if (!options.dryRun && unusedFiles.length > 0) {
      askDeleteFiles(unusedFiles);
    }
}

module.exports = {
  list,
  scan
};