import type { Graph, ChalkInstance } from "../types";
import { timed } from "./utils";

/**
 * Compares old imports with new imports and removes unused ones from the graph
 */
export async function compareAndRemoveOldImports(
  oldPaths: Map<string, Set<string>>,
  graph: Graph,
  chalk: ChalkInstance | unknown
): Promise<number> {
  if (oldPaths.size === 0) {
    return 0;
  }

  return timed(
    "Comparing old paths with new paths",
    () => {
      let removedFilesCount = 0;

      for (const [filePath, oldFiles] of oldPaths) {
        if (graph.has(filePath)) {
          const removedFiles = new Set(
            [...oldFiles].filter((x) => !graph.get(filePath)!.imports.has(x))
          );

          if (removedFiles.size > 0) {
            removedFiles.forEach((file) => {
              if (graph.has(file)) {
                graph.get(file)!.importedBy.delete(filePath);
              }
            });
            removedFilesCount++;
          }
        }
      }

      return removedFilesCount;
    },
    chalk
  );
}

/**
 * Compares old re-exports with new re-exports and removes unused ones from the graph
 */
export async function compareAndRemoveOldReExports(
  oldReExported: Map<string, Set<string>>,
  graph: Graph,
  chalk: ChalkInstance | unknown
): Promise<number> {
  if (oldReExported.size === 0) {
    return 0;
  }

  return timed(
    "Comparing re-exported with new re-exported",
    () => {
      let removedReExportedCount = 0;

      for (const [filePath, oldReExportedFiles] of oldReExported) {
        if (graph.has(filePath)) {
          const removedReExported = new Set(
            [...oldReExportedFiles].filter(
              (x) => !graph.get(filePath)!.reExported.has(x)
            )
          );

          if (removedReExported.size > 0) {
            removedReExported.forEach((reExportedFile) => {
              if (graph.has(reExportedFile)) {
                graph.get(reExportedFile)!.reExportedBy.delete(filePath);
              }
            });
            removedReExportedCount++;
          }
        }
      }

      return removedReExportedCount;
    },
    chalk
  );
}

/**
 * Compares old exports with new exports and removes unused ones from the graph
 */
export async function compareAndRemoveOldExports(
  oldExports: Map<string, Set<string>>,
  graph: Graph,
  chalk: ChalkInstance | unknown
): Promise<number> {
  if (oldExports.size === 0) {
    return 0;
  }

  return timed(
    "Comparing exports with new exports",
    () => {
      let removedExportsCount = 0;

      for (const [filePath, oldExportsNames] of oldExports) {
        if (graph.has(filePath)) {
          const removedExports = new Set(
            [...oldExportsNames].filter(
              (x) => !graph.get(filePath)!.exports.has(x)
            )
          );

          if (removedExports.size > 0) {
            removedExports.forEach((exportName) => {
              if (graph.has(filePath)) {
                graph.get(filePath)!.exports.delete(exportName);
              }
            });
            removedExportsCount++;
          }
        }
      }

      return removedExportsCount;
    },
    chalk
  );
}
