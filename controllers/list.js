const { unUsedFiles } = require("../command");
const { hydrateGraph } = require("../utils/graphUtils");
const Table = require('cli-table3');
const { askDeleteFiles, loadTSConfig, moveFromTrash } = require("../utils/utils");
const fs = require('fs');
const path = require('path');
const { summarizeAll, getTop10LargestFiles, dependenciesSummary, formatFilePath } = require("./summary");
const { query, unusedDependencies: findUnusedDeps } = require("./query");

 async function list(ora, chalk, dependency, options = {}) {
  // Load graph from cache
  const cachePath = path.join(process.cwd(), "unused-check-cache.json");
  if (!fs.existsSync(cachePath)) {
    console.log(chalk.red('⚠️  Cache file not found. Please run "qleaner scan" first to generate the cache.'));
    return;
  }
  
  let cache;
  try {
    cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch {
    console.log(chalk.red('⚠️  Error reading cache file. Please run "qleaner scan" again.'));
    return;
  }
  
  if (!cache.parentGraph || !cache.parentGraph.graph) {
    console.log(chalk.red('⚠️  Invalid cache file. Please run "qleaner scan" again.'));
    return;
  }
  const spinner  = ora('🔍 Loading graph from cache...').start();
  const graph = hydrateGraph(cache.parentGraph.graph);
  await new Promise(resolve => setTimeout(resolve, 500)); // simulate loading time
  spinner.text = '🔍 Querying files by dependency...';
  const filesSet = query(graph, dependency);
  await new Promise(resolve => setTimeout(resolve, 500)); // simulate querying time
  spinner.succeed('Query completed');
  if (!filesSet || filesSet.size === 0) {
    console.log(chalk.yellow(`No files found using ${dependency}`));
    return;
  }
  
  const files = Array.from(filesSet);
  
  console.log(chalk.yellow(`Files using ${dependency}:`));
  console.log(chalk.yellow('════════════════════════════════════════════════'));
  
  if (options.table) {
    const table = new Table({
      head: [chalk.cyan('File Path')],
      colWidths: [100],
      style: { head: [], border: [] }
    });
    
    files.forEach(file => {
      table.push([chalk.white(formatFilePath(file, 95))]);
    });
    
    console.log(table.toString());
  } else {
    files.forEach(file => {
      console.log(chalk.yellow(file));
    });
  }
  
   console.log(chalk.yellow('════════════════════════════════════════════════'));
   // write the total number of files using the dependency
   console.log(chalk.yellow(`Total files using ${dependency}: ${files.length}`));
}

async function unusedDependencies(chalk, directoryPath = process.cwd(), options = {}) {
  // Load package.json
  const packageJsonPath = path.join(directoryPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    console.log(chalk.red('⚠️  Package.json not found.'));
    return;
  }
  
  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch {
    console.log(chalk.red('⚠️  Error reading package.json file.'));
    return;
  }
  
  if (!packageJson.dependencies || Object.keys(packageJson.dependencies).length === 0) {
    console.log(chalk.yellow('No dependencies found in package.json.'));
    return;
  }
  
  const dependencies = Object.keys(packageJson.dependencies);
  
  // Load cache and graph
  const cachePath = path.join(process.cwd(), "unused-check-cache.json");
  if (!fs.existsSync(cachePath)) {
    console.log(chalk.red('⚠️  Cache file not found. Please run "qleaner scan" first to generate the cache.'));
    return;
  }
  
  let cache;
  try {
    cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch {
    console.log(chalk.red('⚠️  Error reading cache file. Please run "qleaner scan" again.'));
    return;
  }
  
  if (!cache.parentGraph || !cache.parentGraph.graph) {
    console.log(chalk.red('⚠️  Invalid cache file. Please run "qleaner scan" again.'));
    return;
  }
  
  const graph = hydrateGraph(cache.parentGraph.graph);
  const unusedDeps = findUnusedDeps(graph, dependencies);
  
  if (unusedDeps.length === 0) {
    console.log(chalk.green('✓ No unused dependencies found. All dependencies are in use.'));
    return;
  }
  
  console.log(chalk.yellow(`Unused Dependencies (${unusedDeps.size}):`)); 
  console.log(chalk.yellow('════════════════════════════════════════════════'));
  
  if (options.table) {
    const table = new Table({
      head: [chalk.cyan('Dependency Name')],
      colWidths: [100],
      style: { head: [], border: [] }
    });
    
    unusedDeps.forEach(dependency => {
      table.push([chalk.white(dependency)]);
    });
    
    console.log(table.toString());
  } else {
    unusedDeps.forEach(dependency => {
      console.log(chalk.yellow(dependency));
    });
  }
  
  console.log(chalk.yellow('════════════════════════════════════════════════'));
  // write the total number of unused dependencies
  console.log(chalk.yellow(`Total unused dependencies: ${unusedDeps.size}`));
}

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


async function scan(ora, chalk, pathToScan, options) {
    let pathConfig = {};
    // check if qleaner.config.json exists
    if (fs.existsSync(path.join(process.cwd(), "qleaner.config.json"))) {
      const config = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "qleaner.config.json"), "utf8")
      );
      options = {
        ...config,
        ...options,
      };
      // config file will take precedence over the tsconfig.json file
      if(config.paths && Object.entries(config.paths).length > 0){
        pathConfig = config.paths;
      }else if(config.codeAlias){
        pathConfig = loadTSConfig(pathToScan, config.codeAlias).paths;
        if(!pathConfig){
          console.log(chalk.red('⚠️  Error reading config file. Please run "qleaner scan" again.'));
          pathConfig = {}
        }
      }
    }

    // read qleaner.config.json
    const unusedFiles = await unUsedFiles(ora, chalk,pathToScan, pathConfig, options);
    
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

async function undoDeletions(chalk, type) {
  console.log(chalk.yellow(`Undoing deletions for ${type}`));
  console.log(chalk.yellow('════════════════════════════════════════════════'));
  await moveFromTrash(type === "code" ? true : false);
  console.log(chalk.green(`Undone deletions for ${type}`));
  console.log(chalk.green('════════════════════════════════════════════════'));
}

module.exports = {
  summary,
  scan,
  list,
  unusedDependencies,
  undoDeletions,
};