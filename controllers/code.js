const fs = require("fs");
const path = require("path");
const { hydrateGraph } = require("../utils/graphUtils");
const { createStepBar } = require("../utils/utils");

async function findUnusedExports(chalk) {
  // read file unused-check-cache.json
  const cache = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "unused-check-cache.json"),
      "utf8",
    ),
  );
  const graph = hydrateGraph(cache.parentGraph.graph);
  const fileAssociated = new Map();
  const scanBar = createStepBar(
    `1/${graph.size}`,
    graph.size,
    "Finding unused exports",
    chalk,
  );
  const unUsedExportsWithPath = new Map();
  const unusedExports = new Set();
  const usedExports = new Set();

  for (const [, node] of graph.entries()) {
    if (node.exports.size === 0) {
      scanBar.increment();
      continue;
    }
    fileAssociated.set(node.file, new Set());
    findUnusedFlags(
      node,
      unusedExports,
      usedExports,
      graph,
      node.exports,
      unUsedExportsWithPath,
      node.file,
      fileAssociated,
    );
    scanBar.increment();
  }
  scanBar.stop();
  return { unUsedExportsWithPath, fileAssociated };
}

function findUnusedFlags(
  node,
  unusedExports,
  usedExports,
  graph,
  exportedNames,
  unUsedExportsWithPath,
  currentFile,
  fileAssociated,
) {
  if (node.importedBy.size > 0) {
    for (const importedByFile of node.importedBy) {
      const importedNode = graph.get(importedByFile);
      const components = importedNode.imported.get(node.file);
      if (!components || (components && components.size === 0)) {
        return;
      }
      exportedNames.forEach((exportComponentName) => {
        components.forEach((component) => {
          if (
            component.includes(exportComponentName) ||
            component.includes("*")
          ) {
            usedExports.add(exportComponentName);
            if (unusedExports.has(exportComponentName)) {
              unusedExports.delete(exportComponentName);
              unUsedExportsWithPath.delete(exportComponentName);
              fileAssociated.delete(currentFile);
            }
            return;
          }
        });
        if (!usedExports.has(exportComponentName)) {
          unusedExports.add(exportComponentName);
          unUsedExportsWithPath.set(exportComponentName, currentFile);
          if (fileAssociated.has(currentFile)) {
            fileAssociated.get(currentFile).add(importedByFile);
          } else {
            fileAssociated.set(currentFile, new Set([importedByFile]));
          }
        }
      });
    }
  }

  if (node.reExportedBy.size > 0) {
    for (const reExportedByFile of node.reExportedBy) {
      const reExportedByNode = graph.get(reExportedByFile);
      if (fileAssociated.has(currentFile)) {
        fileAssociated.get(currentFile).add(reExportedByFile);
      }
      findUnusedFlags(
        reExportedByNode,
        unusedExports,
        usedExports,
        graph,
        exportedNames,
        unUsedExportsWithPath,
        currentFile,
        fileAssociated,
      );
    }
  }
}

module.exports = {
  findUnusedExports,
};
