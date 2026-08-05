import fs from "fs";
import path from "path";
import { hydrateGraph } from "../utils/graphUtils";
import { timed } from "../utils/utils";
import type {
  CacheFile,
  ChalkInstance,
  Graph,
  GraphNode,
} from "../types";

export async function findUnusedExports(chalk: ChalkInstance): Promise<{
  unUsedExportsWithPath: Map<string, string>;
  fileAssociated: Map<string, Set<string>>;
}> {
  const cache = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "unused-check-cache.json"),
      "utf8",
    ),
  ) as CacheFile;
  const graph = hydrateGraph(cache.parentGraph.graph);
  const fileAssociated = new Map<string, Set<string>>();
  const unUsedExportsWithPath = new Map<string, string>();
  const unusedExports = new Set<string>();
  const usedExports = new Set<string>();

  await timed(
    "Finding unused exports",
    () => {
      for (const [, node] of graph.entries()) {
        if (node.exports.size === 0) {
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
      }
    },
    chalk,
  );

  return { unUsedExportsWithPath, fileAssociated };
}

function findUnusedFlags(
  node: GraphNode | undefined,
  unusedExports: Set<string>,
  usedExports: Set<string>,
  graph: Graph,
  exportedNames: Set<string>,
  unUsedExportsWithPath: Map<string, string>,
  currentFile: string,
  fileAssociated: Map<string, Set<string>>,
): void {
  if (!node) {
    return;
  }
  if (node.importedBy.size > 0) {
    for (const importedByFile of node.importedBy) {
      const importedNode = graph.get(importedByFile);
      if (!importedNode) {
        continue;
      }
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
            fileAssociated.get(currentFile)!.add(importedByFile);
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
        fileAssociated.get(currentFile)!.add(reExportedByFile);
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
