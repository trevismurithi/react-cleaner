const fg = require("fast-glob");
const path = require("path");
const { createResolver } = require("./utils/resolver");
const { loadCache, saveCache, normalizeFixes } = require("./utils/cache");
const {
  isExcludedFile,
  createStepBar,
  timed,
  logStage,
} = require("./utils/utils");
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
function initializeCache(options, chalk, code = true) {
  logStage(chalk, "Loading cache");
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
  logStage(chalk, "Cache loaded", "done");
  return {
    parentGraph: {
      graph: graph || cache.parentGraph.graph,
      unusedFiles: new Set(cache.parentGraph.unusedFiles),
      fixes: normalizeFixes(cache.parentGraph.fixes),
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
 * @param {Object} chalk - Chalk instance for stage logs
 * @returns {number} Number indicating changes (imports count or removed items count)
 */
async function extractImportsFromFiles(files, graph, resolver, chalk) {
  const { imports, exports, oldPaths, oldExports, oldReExported } =
    await scanFilesForImportsAndExports(files, graph, chalk);

  await processImports(imports, graph, resolver, chalk);
  await processExports(exports, graph, resolver, chalk);

  const [removedFilesCount, removedReExportedCount, removedExportsCount] =
    await Promise.all([
      compareAndRemoveOldImports(oldPaths, graph, chalk),
      compareAndRemoveOldReExports(oldReExported, graph, chalk),
      compareAndRemoveOldExports(oldExports, graph, chalk),
    ]);

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
  const fileNode = parentGraph.graph.get(file);
  if (!fileNode || fileNode.importedBy.size > 0) {
    return;
  }

  if (options.excludeFilePrint && options.excludeFilePrint.length > 0) {
    if (isExcludedFile(file, options.excludeFilePrint)) {
      return;
    }
  }

  const isUsed = checkImportedComponentsUsage(file, parentGraph);
  if (!isUsed) {
    parentGraph.unusedFiles.add({ file: fileNode.file, size: fileNode.size });
  }
}

function checkImportedComponentsUsage(file, parentGraph) {
  const fileNode = parentGraph.graph.get(file);
  if (!fileNode) {
    return false;
  }

  const reExportedBy = fileNode.reExportedBy;
  if (reExportedBy.size === 0) {
    return false;
  }

  const exportedComponents = fileNode.exports;
  if (exportedComponents.size === 0) {
    return false;
  }
  return trackExportedComponents(reExportedBy, exportedComponents, parentGraph);
}

function trackExportedComponents(reExportedBy, exportedComponents, parentGraph) {
  let isUsed = false;
  const notUsed = false;
  for (const reExportingFile of reExportedBy) {
    const reExportingNode = parentGraph.graph.get(reExportingFile);
    if (!reExportingNode) {
      continue;
    }

    const importedBy = reExportingNode.importedBy;

    const reExportedByFiles = reExportingNode.reExportedBy;
    if (reExportedByFiles.size > 0) {
      isUsed = trackExportedComponents(
        reExportedByFiles,
        exportedComponents,
        parentGraph
      );
    }
    for (const importingFile of importedBy) {
      const importingNode = parentGraph.graph.get(importingFile);
      if (!importingNode) {
        continue;
      }

      const imported = importingNode.imported;
      if (!imported || !imported.has(reExportingFile)) {
        continue;
      }

      const components = imported.get(reExportingFile);
      if (!components || components.size === 0) {
        continue;
      }

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

async function checkUnusedFiles(files, parentGraph, options, chalk) {
  if (options.excludeDirPrint && options.excludeDirPrint.length > 0) {
    files = files.filter(
      (file) => !isExcludedFile(file, options.excludeDirPrint)
    );
  }
  const checkBar = createStepBar(
    `1/${files.length}`,
    files.length,
    "Checking unused files",
    chalk
  );
  for (const file of files) {
    await checkFileUsage(path.resolve(file), parentGraph, options);
    checkBar.increment();
  }
  checkBar.stop();
}

function finalizeCacheAndReturn(parentGraph, chalk, imageParentGraph) {
  logStage(
    chalk,
    `Found ${parentGraph.unusedFiles.size} unused files`,
    "done"
  );
  saveCache(process.cwd(), { parentGraph, imageParentGraph });
  return parentGraph.unusedFiles;
}

async function unUsedFiles(chalk, directory = "src", pathConfig = null, options) {
  logStage(chalk, "Start Qleaner scan");

  const resolver = createResolver(directory, pathConfig);
  const { parentGraph, imageParentGraph } = initializeCache(options, chalk);
  const contentPaths = buildContentPaths(directory, options);

  const files = await timed(
    "Discovering files",
    () => fg(contentPaths),
    chalk
  );
  logStage(chalk, `Found ${files.length} files`, "info");

  const importsCount = await extractImportsFromFiles(
    files,
    parentGraph.graph,
    resolver,
    chalk
  );

  if (parentGraph.unusedFiles.size === 0 || importsCount > 0) {
    parentGraph.unusedFiles = new Set();
    await checkUnusedFiles(files, parentGraph, options, chalk);
  }

  return finalizeCacheAndReturn(parentGraph, chalk, imageParentGraph);
}

module.exports = {
  unUsedFiles,
  initializeCache,
};
