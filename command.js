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
} = require("./utils/cache");
const { isExcludedFile, createStepBar } = require("./utils/utils");


// Initializes the cache by clearing it (if requested) and loading it from disk
function initializeCache(spinner, options, code = true) {
  spinner.text = "🔍 Loading cache...";
  const cache = loadCache(process.cwd(), {code, clearCache: options.clearCache});
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
  if (options.excludeExtensions && options.excludeExtensions.length > 0) {
    options.excludeExtensions.forEach((extension) => {
      contentPaths.push(`!${directory}/**/*.${extension}`);
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
        plugins: ["jsx", "typescript", "decorators-legacy"],
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
        CallExpression({ node }) {
          if (node.callee.type === "Import") {
            const arg = node.arguments[0]
      
            if (arg?.type === "StringLiteral") {
              imports.push({
                file: filePath,
                source: arg.value,
                type: "dynamic"
              })
            } else {
              imports.push({
                file: filePath,
                source: null,
                type: "dynamic-variable"
              })
            }
          }
        }
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
    const {importPath, isMightBeModule} = await resolver(info.file, info.source);
    if (!isMightBeModule) {
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
    }else {
      graph.get(info.file).imports.add(importPath);
      if (!graph.has(importPath)) {
        graph.set(importPath, {
          file: importPath,
          size: 0,
          hash: null,
          imports: new Set(),
          importedBy: new Set(),
          lastModified: null,
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
  unUsedFiles,
  initializeCache,
  hydrateGraph,
};
