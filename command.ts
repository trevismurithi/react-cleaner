import fg from "fast-glob";
import path from "path";
import { createResolver } from "./utils/resolver";
import { loadCache, saveCache, normalizeFixes } from "./utils/cache";
import {
  isExcludedFile,
  timed,
  logStage,
} from "./utils/utils";
import { buildContentPaths } from "./utils/pathBuilder";
import { hydrateGraph } from "./utils/graphUtils";
import {
  scanFilesForImportsAndExports,
  processImports,
  processExports,
} from "./utils/fileProcessing";
import {
  compareAndRemoveOldImports,
  compareAndRemoveOldReExports,
  compareAndRemoveOldExports,
} from "./utils/graphComparison";
import type {
  ChalkInstance,
  Graph,
  ImageGraph,
  ImageParentGraph,
  ParentGraph,
  ScanOptions,
  UnusedFileEntry,
} from "./types";

// Initializes the cache by clearing it (if requested) and loading it from disk
export function initializeCache(
  options: ScanOptions,
  chalk: ChalkInstance,
  code = true
): { parentGraph: ParentGraph; imageParentGraph: ImageParentGraph } {
  logStage(chalk, "Loading cache");
  const cache = loadCache(process.cwd(), {
    code,
    clearCache: options.clearCache,
  });
  let graph: Graph | null = null;
  let imageGraph: ImageGraph | null = null;
  if (code) {
    graph = hydrateGraph(cache.parentGraph.graph);
  } else {
    imageGraph = hydrateGraph(
      cache.imageParentGraph.imageGraph
    ) as unknown as ImageGraph;
  }
  logStage(chalk, "Cache loaded", "done");
  return {
    parentGraph: {
      graph: graph || (cache.parentGraph.graph as unknown as Graph),
      unusedFiles: new Set(cache.parentGraph.unusedFiles),
      fixes: normalizeFixes(cache.parentGraph.fixes),
    },
    imageParentGraph: {
      imageGraph:
        imageGraph ||
        (cache.imageParentGraph.imageGraph as unknown as ImageGraph),
      unusedImages: new Set(cache.imageParentGraph.unusedImages),
    },
  };
}

/**
 * Extracts import statements from files by parsing AST, only processes files that need rebuilding
 * Orchestrates the scanning, processing, and comparison of imports/exports
 * @param files - Array of file paths to process
 * @param graph - The dependency graph
 * @param resolver - Resolver function to resolve import/export paths
 * @param chalk - Chalk instance for stage logs
 * @returns Number indicating changes (imports count or removed items count)
 */
async function extractImportsFromFiles(
  files: string[],
  graph: Graph,
  resolver: ReturnType<typeof createResolver>,
  chalk: ChalkInstance
): Promise<number> {
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
async function checkFileUsage(
  file: string,
  parentGraph: ParentGraph,
  options: ScanOptions
): Promise<void> {
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

function checkImportedComponentsUsage(
  file: string,
  parentGraph: ParentGraph
): boolean {
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

function trackExportedComponents(
  reExportedBy: Set<string>,
  exportedComponents: Set<string>,
  parentGraph: ParentGraph
): boolean {
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

async function checkUnusedFiles(
  files: string[],
  parentGraph: ParentGraph,
  options: ScanOptions,
  chalk: ChalkInstance
): Promise<void> {
  let filesToCheck = files;
  if (options.excludeDirPrint && options.excludeDirPrint.length > 0) {
    filesToCheck = filesToCheck.filter(
      (file) => !isExcludedFile(file, options.excludeDirPrint!)
    );
  }
  await timed(
    "Checking unused files",
    async () => {
      for (const file of filesToCheck) {
        await checkFileUsage(path.resolve(file), parentGraph, options);
      }
    },
    chalk
  );
}

function finalizeCacheAndReturn(
  parentGraph: ParentGraph,
  chalk: ChalkInstance,
  imageParentGraph: ImageParentGraph
): Set<UnusedFileEntry | string> {
  logStage(
    chalk,
    `Found ${parentGraph.unusedFiles.size} unused files`,
    "done"
  );
  saveCache(process.cwd(), { parentGraph, imageParentGraph });
  return parentGraph.unusedFiles;
}

export async function unUsedFiles(
  chalk: ChalkInstance,
  directory = "src",
  pathConfig: Record<string, string[]> | null = null,
  options: ScanOptions
): Promise<Set<UnusedFileEntry | string>> {
  logStage(chalk, "Start Qleaner scan");

  const resolver = createResolver(directory, pathConfig ?? undefined);
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
