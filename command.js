const fg = require("fast-glob");
const fs = require("fs");
const Table = require("cli-table3");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const path = require("path");
const { createResolver } = require("./utils/resolver");
const {
  loadCache,
  getFileHash,
  needsRebuild,
  saveCache,
  clearCache,
} = require("./utils/cache");
const { isExcludedFile, createStepBar } = require("./utils/utils");

async function getFiles(directory = "src", options, chalk) {
  const contentPaths = [`${directory}/**/*.{tsx,ts,js,jsx}`];
  if (options.excludeDir && options.excludeDir.length > 0) {
    options.excludeDir.forEach((dir) => {
      contentPaths.push(`!${dir}/**`);
    });
  }
  if (options.excludeFile && options.excludeFile.length > 0) {
    options.excludeFile.forEach((file) => {
      contentPaths.push(`!${directory}/**/${file}`);
    });
  }

  const files = await fg(contentPaths);
  const imports = [];

  let index = 0;
  for (const file of files) {
    index++;
    // console.clear();
    // console.log("Scanning file...", index, "of", files.length);
    const code = fs.readFileSync(file, "utf8");
    const ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
    traverse(ast, {
      ImportDeclaration: ({ node }) => {
        imports.push({
          from: node.source.value,
          file: file,
          line: node.loc.start.line,
          column: node.loc.start.column,
        });
      },
    });
    //   ExportNamedDeclaration: ({ node }) => {
    //     if (node.declaration.declarations && node.declaration.declarations[0].id && node.declaration.declarations[0].id.name) {
    //       exports.push(node.declaration.declarations[0].id.name);
    //     }
    //   },
    //   FunctionDeclaration: ({ node }) => {
    //     console.log('FunctionDeclaration', node.id);
    //     if (node.id && node.id.name) {
    //       exports.push(node.id.name);
    //     }
    //   },
    // });
  }

  if (options.table) {
    const tableImports = new Table({
      head: ["File", "Line", "Column", "Import"],
      colWidths: [20, 10, 10, 20],
    });

    const tableFiles = new Table({
      head: ["File"],
      colWidths: [20],
    });

    if (options.listFiles) {
      files.forEach((file) => {
        tableFiles.push([file]);
      });
    }
    if (options.listImports) {
      imports.forEach((importStatement) => {
        tableImports.push([
          importStatement.file,
          importStatement.line,
          importStatement.column,
          importStatement.from,
        ]);
      });
    }
    return { tableImports, tableFiles };
  } else {
    if (options.listFiles) {
      console.log(chalk.green("***************** Files *****************"));
      files.forEach((file) => {
        console.log(chalk.green(file));
      });
    }
    if (options.listImports) {
      console.log(chalk.yellow("***************** Imports *****************"));
      imports.forEach((importStatement) => {
        console.log(
          chalk.yellow(
            `${importStatement.file}:${importStatement.line}:${importStatement.column}  ${importStatement.from}`
          )
        );
      });
    }
    return { tableImports: imports, tableFiles: files };
  }
}

// Initializes the cache by clearing it (if requested) and loading it from disk
function initializeCache(spinner, options, code = true) {
  if (options.clearCache) {
    spinner.text = "🔍 Clearing cache...";
    clearCache(process.cwd());
    spinner.succeed("Cache cleared successfully");
  }
  spinner.text = "🔍 Loading cache...";
  const cache = loadCache(process.cwd());
  let graph = null;
  let imageGraph = null;
  if (code) {
    graph = hydrateGraph(cache.parentGraph.graph);
  } else {
    imageGraph = hydrateGraph(cache.imageParentGraph.imageGraph);
  }
  spinner.succeed("Cache loaded successfully");
  return {
    parentGraph: {
      graph: graph || cache.parentGraph.graph,
      unusedFiles: new Set(cache.parentGraph.unusedFiles),
    },
    imageParentGraph: {
      imageGraph: imageGraph || cache.imageParentGraph.imageGraph,
      unusedImages: new Set(cache.imageParentGraph.unusedImages),
    },
  };
}

// Builds an array of glob patterns for file discovery, including exclusion patterns
function buildContentPaths(directory, options) {
  const contentPaths = [`${directory}/**/*.{tsx,ts,js,jsx}`];
  if (options.excludeDir && options.excludeDir.length > 0) {
    options.excludeDir.forEach((dir) => {
      contentPaths.push(`!${dir}/**`);
    });
  }
  if (options.excludeFile && options.excludeFile.length > 0) {
    options.excludeFile.forEach((file) => {
      contentPaths.push(`!${directory}/**/${file}`);
    });
  }
  return contentPaths;
}

// Extracts import statements from files by parsing AST, only processes files that need rebuilding
async function extractImportsFromFiles(files, graph, resolver, chalk) {
  const scanBar = createStepBar(
    `1/${files.length}`,
    files.length,
    "Scanning files",
    chalk
  );
  let packingBar = null;
  const imports = [];
  const oldPaths = new Map();
  for (const file of files) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    scanBar.increment();
    const filePath = path.resolve(file);
    const code = fs.readFileSync(filePath, "utf8");
    const isNeedsRebuild = needsRebuild(filePath, code, graph);
    if (isNeedsRebuild) {
      const ast = parser.parse(code, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      });
      // check if file is already in graph
      if (graph.has(filePath)) {
        const oldFiles = new Set(graph.get(filePath).imports);
        oldPaths.set(filePath, new Set(oldFiles));
      }
      // create file graph node if it doesn't exist
      graph.set(filePath, {
        file: filePath,
        hash: getFileHash(code),
        imports: new Set(),
        importedBy: new Set(),
        lastModified: fs.statSync(filePath).mtime.getTime(),
        size: fs.statSync(filePath).size,
      });
      traverse(ast, {
        ImportDeclaration: ({ node }) => {
          imports.push({
            file: filePath,
            source: node.source.value,
          });
        },
      });
    }
  }
  scanBar.stop();

  if (imports.length > 0) {
    packingBar = createStepBar(
      `1/${imports.length}`,
      imports.length,
      "Packing imports",
      chalk
    );
  }
  for (const info of imports) {
    if (packingBar) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      packingBar.increment();
    }
    const importPath = await resolver(info.file, info.source);
    if (importPath !== null) {
      graph.get(info.file).imports.add(importPath);
      if (!graph.has(importPath)) {
        graph.set(importPath, {
          file: importPath,
          size: fs.statSync(importPath).size,
          hash: getFileHash(fs.readFileSync(importPath, "utf8")),
          imports: new Set(),
          importedBy: new Set(),
          lastModified: fs.statSync(importPath).mtime.getTime(),
        });
      }
      graph.get(importPath).importedBy.add(info.file);
    }
  }
  if (packingBar) {
    packingBar.stop();
  }

  let compareBar = null;
  if (oldPaths.size > 0) {
    compareBar = createStepBar(
      `1/${oldPaths.size}`,
      oldPaths.size,
      "Comparing old paths with new paths",
      chalk
    );
  }
  // count the number of removed files
  let removedFilesCount = 0;
  // compare old paths with new paths
  // if some old paths are found missing in new paths, remove them from the graph
  for (const [filePath, oldFiles] of oldPaths) {
    if (compareBar) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      compareBar.increment();
    }
    if (graph.has(filePath)) {
      // Find files that were in oldFiles but are no longer in current imports
      const removedFiles = new Set(
        [...oldFiles].filter((x) => !graph.get(filePath).imports.has(x))
      );
      if (removedFiles.size > 0) {
        // remove the removed files from the graph
        removedFiles.forEach((file) => {
          if (graph.has(file)) {
            graph.get(file).importedBy.delete(filePath);
          }
        });
        removedFilesCount++;
      }
    }
  }
  if (compareBar) {
    compareBar.stop();
  }
  // return the number of imports or the number of removed files
  return imports.length || removedFilesCount;
}

// Checks if a single file is imported/used by comparing it against all import statements
// If not found in any imports and not excluded, adds it to the unused files set
async function checkFileUsage(file, parentGraph, options) {
  if (
    parentGraph.graph.has(file) &&
    parentGraph.graph.get(file).importedBy.size === 0
  ) {
    if (options.excludeFilePrint && options.excludeFilePrint.length > 0) {
      if (!isExcludedFile(file, options.excludeFilePrint)) {
        parentGraph.unusedFiles.add(parentGraph.graph.get(file));
      }
    } else {
      parentGraph.unusedFiles.add(parentGraph.graph.get(file));
    }
  }
}

// Checks all files to determine which ones are unused by comparing against import statements
// Initializes unused files set from cache if available, then checks each file
async function checkUnusedFiles(files, parentGraph, options, chalk) {
  const checkBar = createStepBar(
    `1/${files.length}`,
    files.length,
    "Checking unused files",
    chalk
  );
  for (const file of files) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await checkFileUsage(path.resolve(file), parentGraph, options);
    checkBar.increment();
  }
  checkBar.stop();
}

// Saves the cache with updated imports and unused files, then returns the unused files array
function finalizeCacheAndReturn(parentGraph, spinner, imageParentGraph) {
  spinner.succeed(`Found ${parentGraph.unusedFiles.size} unused files`);
  saveCache(process.cwd(), { parentGraph, imageParentGraph });
  return parentGraph.unusedFiles;
}

function hydrateGraph(graphData) {
  const graph = new Map();
  for (const [file, data] of Object.entries(graphData)) {
    graph.set(file, {
      ...data,
      imports: new Set(data.imports),
      importedBy: new Set(data.importedBy),
    });
  }
  return graph;
}
// Main function that orchestrates the unused files detection process
// Step 1: Discovers files, Step 2: Extracts imports, Step 3: Checks which files are unused
async function unUsedFiles(ora, chalk, directory = "src", options) {
  // Start spinner
  const spinner = ora("Start Qleaner scan...").start();

  const resolver = createResolver(directory);
  const { parentGraph, imageParentGraph } = initializeCache(spinner, options);
  const contentPaths = buildContentPaths(directory, options);

  const LOG_PREFIX = "Qleaner scan";
  console.time(LOG_PREFIX);
  // STEP 1: Discover all files matching the patterns
  spinner.text = "🔍 Discovering files...";
  const files = await fg(contentPaths);
  spinner.succeed(`Found ${files.length} files`);

  // STEP 2: Extract import statements from files
  spinner.text = "🔍 Checking files...";
  const importsCount = await extractImportsFromFiles(
    files,
    parentGraph.graph,
    resolver,
    chalk
  );

  spinner.succeed(`Checked ${files.length} files`);

  // STEP 3: Check which files are unused by comparing against imports
  spinner.text = "🔍 Checking imports...";
  if (parentGraph.unusedFiles.size === 0 || importsCount > 0) {
    parentGraph.unusedFiles = new Set();
    await checkUnusedFiles(files, parentGraph, options, chalk);
  }
  spinner.succeed(`Checked ${parentGraph.unusedFiles.size} unused files`);

  console.timeEnd(LOG_PREFIX);
  return finalizeCacheAndReturn(parentGraph, spinner, imageParentGraph);
}

module.exports = {
  getFiles,
  unUsedFiles,
  initializeCache,
  hydrateGraph,
};
