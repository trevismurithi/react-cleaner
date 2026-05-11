const fg = require("fast-glob");
const path = require("path");
const { createResolver } = require("./utils/resolver");
const { loadCache, saveCache } = require("./utils/cache");
const { isExcludedFile, createStepBar } = require("./utils/utils");
const { buildContentPaths } = require("./utils/pathBuilder");
const { hydrateGraph } = require("./utils/graphUtils");
const {
  scanFilesForImportsAndExports,
  processImports,
  processExports,
} = require("./utils/fileProcessing");
const {
  compareAndRemoveOldImports,
  compareAndRemoveOldReExports,
  compareAndRemoveOldExports,
} = require("./utils/graphComparison");

// Initializes the cache by clearing it (if requested) and loading it from disk
function initializeCache(spinner, options, code = true) {
  spinner.text = "🔍 Loading cache...";
  const cache = loadCache(process.cwd(), {
    code,
    clearCache: options.clearCache,
  });
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

/**
 * Extracts import statements from files by parsing AST, only processes files that need rebuilding
 * Orchestrates the scanning, processing, and comparison of imports/exports
 * @param {Array<string>} files - Array of file paths to process
 * @param {Map} graph - The dependency graph
 * @param {Function} resolver - Resolver function to resolve import/export paths
 * @param {Object} chalk - Chalk instance for progress bars
 * @returns {number} Number indicating changes (imports count or removed items count)
 */
async function extractImportsFromFiles(files, graph, resolver, chalk) {
  // Step 1: Scan files and extract imports/exports from AST
  const { imports, exports, oldPaths, oldExports, oldReExported } =
    await scanFilesForImportsAndExports(files, graph, chalk);
  // Step 2: Process imports and add them to the graph
  await processImports(imports, graph, resolver, chalk);
  //  console.dir(imports, { depth: null });
  // Step 3: Process exports and add them to the graph
  await processExports(exports, graph, resolver, chalk);
  // console.dir(exports, { depth: null });

  // Step 4: Compare old state with new state and remove unused items
  // These operations are independent and can run in parallel
  const [removedFilesCount, removedReExportedCount, removedExportsCount] =
    await Promise.all([
      compareAndRemoveOldImports(oldPaths, graph, chalk),
      compareAndRemoveOldReExports(oldReExported, graph, chalk),
      compareAndRemoveOldExports(oldExports, graph, chalk),
    ]);

  // Return the number of imports or the number of removed files
  return (
    imports.length ||
    removedFilesCount ||
    removedReExportedCount ||
    removedExportsCount
  );
}

// Checks if a single file is imported/used by comparing it against all import statements
// If not found in any imports and not excluded, adds it to the unused files set
async function checkFileUsage(file, parentGraph, options) {
  // Cache the file node to avoid repeated graph lookups
  const fileNode = parentGraph.graph.get(file);
  if (!fileNode || fileNode.importedBy.size > 0) {
    return;
  }

  // Check if file should be excluded
  if (options.excludeFilePrint && options.excludeFilePrint.length > 0) {
    if (isExcludedFile(file, options.excludeFilePrint)) {
      return;
    }
  }

  // Check if the file has a component name imported from the shared file
  // It should not be considered unused if components are used via re-exports
  const isUsed = checkImportedComponentsUsage(file, parentGraph);
  if (!isUsed) {
    parentGraph.unusedFiles.add({file: fileNode.file, size: fileNode.size});
  }
}

function checkImportedComponentsUsage(file, parentGraph) {
  // Cache the file node to avoid repeated graph lookups
  const fileNode = parentGraph.graph.get(file);
  if (!fileNode) {
    return false;
  }

  // Early exit if file is not re-exported
  const reExportedBy = fileNode.reExportedBy;
  if (reExportedBy.size === 0) {
    return false;
  }

  // Cache exported components and check once upfront
  const exportedComponents = fileNode.exports;
  if (exportedComponents.size === 0) {
    return false;
  }
  return trackExportedComponents(reExportedBy, exportedComponents, parentGraph);
}

function trackExportedComponents(reExportedBy, exportedComponents, parentGraph) {
    let isUsed = false;
    const notUsed = false
    // Loop through the re-exported files, check if there is a file that imports any of the components or *
    for (const reExportingFile of reExportedBy) {
      // Cache the re-exporting file node
      const reExportingNode = parentGraph.graph.get(reExportingFile);
      if (!reExportingNode) {
        continue;
      }
  
      const importedBy = reExportingNode.importedBy; // A.ts -> B.ts
      // if (importedBy.size === 0) {
      //   continue;
      // }

      // check reExportedBy if available
      const reExportedByFiles = reExportingNode.reExportedBy;
      if (reExportedByFiles.size > 0) {
        isUsed = trackExportedComponents(reExportedByFiles, exportedComponents, parentGraph);
      }
      // Loop through the importing files, check if they import any of the components or *
      for (const importingFile of importedBy) {
        // Cache the importing file node
        const importingNode = parentGraph.graph.get(importingFile);
        if (!importingNode) {
          continue;
        }
  
        const imported = importingNode.imported; // B.ts -> A.ts -> B.ts
        if (!imported || !imported.has(reExportingFile)) {
          continue;
        }
  
        const components = imported.get(reExportingFile); // B.ts -> A.ts -> B.ts [['ComponentD', 'D2'], ['ComponentC', 'ComponentC']]
        if (!components || components.size === 0) {
          continue;
        }
  
        // Check if any imported component matches exported components or is a wildcard
        for (const component of components) {
          if (
            exportedComponents.has(component[0]) ||
            exportedComponents.has(component[1]) ||
            component[0] === "*" ||
            component[1] === "*"
          ) {
            return true;
          }
        }
      }
    }
    return notUsed || isUsed;
}

// Checks all files to determine which ones are unused by comparing against import statements
// Initializes unused files set from cache if available, then checks each file
async function checkUnusedFiles(files, parentGraph, options, chalk) {
  if (options.excludeDirPrint && options.excludeDirPrint.length > 0) {
    files = files.filter((file) => !isExcludedFile(file, options.excludeDirPrint));
  }
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

// Main function that orchestrates the unused files detection process
// Step 1: Discovers files, Step 2: Extracts imports, Step 3: Checks which files are unused
async function unUsedFiles(ora, chalk, directory = "src", pathConfig = null, options) {
  // Start spinner
  const spinner = ora("Start Qleaner scan...").start();

  const resolver = createResolver(directory, pathConfig);
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
};
