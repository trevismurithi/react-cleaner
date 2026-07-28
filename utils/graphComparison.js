const { createStepBar } = require("./utils");

/**
 * Compares old imports with new imports and removes unused ones from the graph
 * @param {Map} oldPaths - Map of file paths to their old import sets
 * @param {Map} graph - The current graph
 * @param {Object} chalk - Chalk instance for progress bar
 * @returns {number} Number of files with removed imports
 */
async function compareAndRemoveOldImports(oldPaths, graph, chalk) {
  if (oldPaths.size === 0) {
    return 0;
  }

  const compareBar = createStepBar(
    `1/${oldPaths.size}`,
    oldPaths.size,
    "Comparing old paths with new paths",
    chalk
  );

  let removedFilesCount = 0;

  for (const [filePath, oldFiles] of oldPaths) {
    compareBar.increment();

    if (graph.has(filePath)) {
      const removedFiles = new Set(
        [...oldFiles].filter((x) => !graph.get(filePath).imports.has(x))
      );

      if (removedFiles.size > 0) {
        removedFiles.forEach((file) => {
          if (graph.has(file)) {
            graph.get(file).importedBy.delete(filePath);
          }
        });
        removedFilesCount++;
      }
    }
  }

  compareBar.stop();
  return removedFilesCount;
}

/**
 * Compares old re-exports with new re-exports and removes unused ones from the graph
 * @param {Map} oldReExported - Map of file paths to their old re-export sets
 * @param {Map} graph - The current graph
 * @param {Object} chalk - Chalk instance for progress bar
 * @returns {number} Number of files with removed re-exports
 */
async function compareAndRemoveOldReExports(oldReExported, graph, chalk) {
  if (oldReExported.size === 0) {
    return 0;
  }

  const reExportedCompareBar = createStepBar(
    `1/${oldReExported.size}`,
    oldReExported.size,
    "Comparing re-exported with new re-exported",
    chalk
  );

  let removedReExportedCount = 0;

  for (const [filePath, oldReExportedFiles] of oldReExported) {
    reExportedCompareBar.increment();

    if (graph.has(filePath)) {
      const removedReExported = new Set(
        [...oldReExportedFiles].filter(
          (x) => !graph.get(filePath).reExported.has(x)
        )
      );

      if (removedReExported.size > 0) {
        removedReExported.forEach((reExportedFile) => {
          if (graph.has(reExportedFile)) {
            graph.get(reExportedFile).reExportedBy.delete(filePath);
          }
        });
        removedReExportedCount++;
      }
    }
  }

  reExportedCompareBar.stop();
  return removedReExportedCount;
}

/**
 * Compares old exports with new exports and removes unused ones from the graph
 * @param {Map} oldExports - Map of file paths to their old export name sets
 * @param {Map} graph - The current graph
 * @param {Object} chalk - Chalk instance for progress bar
 * @returns {number} Number of files with removed exports
 */
async function compareAndRemoveOldExports(oldExports, graph, chalk) {
  if (oldExports.size === 0) {
    return 0;
  }

  const exportsCompareBar = createStepBar(
    `1/${oldExports.size}`,
    oldExports.size,
    "Comparing exports with new exports",
    chalk
  );

  let removedExportsCount = 0;

  for (const [filePath, oldExportsNames] of oldExports) {
    exportsCompareBar.increment();

    if (graph.has(filePath)) {
      const removedExports = new Set(
        [...oldExportsNames].filter((x) => !graph.get(filePath).exports.has(x))
      );

      if (removedExports.size > 0) {
        removedExports.forEach((exportName) => {
          if (graph.has(filePath)) {
            graph.get(filePath).exports.delete(exportName);
          }
        });
        removedExportsCount++;
      }
    }
  }

  exportsCompareBar.stop();
  return removedExportsCount;
}

module.exports = {
  compareAndRemoveOldImports,
  compareAndRemoveOldReExports,
  compareAndRemoveOldExports,
};
