import type { Graph, GraphNode, ImageGraph, ImageGraphNode } from "../types";

type AnyGraph = Graph | ImageGraph;
type AnyNode = GraphNode | ImageGraphNode;

export function getDeadLinks(graph: AnyGraph): {
  deadLinks: Map<string, AnyNode>;
  aliveLinks: Map<string, AnyNode>;
} {
  // get the dead links from the graph
  const deadLinks = new Map<string, AnyNode>();
  const aliveLinks = new Map<string, AnyNode>();
  for (const [filePath, node] of graph.entries()) {
    if (node.hash === null) {
      deadLinks.set(filePath, { ...node });
    } else {
      aliveLinks.set(filePath, { ...node });
    }
  }
  return { deadLinks, aliveLinks };
}

export function getTotalImageSize(graph: ImageGraph): number {
  let totalSize = 0;
  for (const [, node] of graph.entries()) {
    if (node.hash !== null && node.isImage === true) {
      totalSize += node.size;
    }
  }
  return totalSize;
}

export function getTotalCodeSize(graph: Graph): number {
  let totalSize = 0;
  for (const [, node] of graph.entries()) {
    totalSize += node.size;
  }
  return totalSize;
}

export function getTop10LargestImages(
  graph: ImageGraph
): Array<[string, number]> {
  const largestImages = new Map<string, number>();
  for (const [filePath, node] of graph.entries()) {
    if (node.isImage === true && node.hash !== null) {
      largestImages.set(filePath, node.size);
    }
  }
  return Array.from(largestImages.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
}

export function getTop10LargestCodeFiles(
  graph: Graph
): Array<[string, number]> {
  const largestCodeFiles = new Map<string, number>();
  for (const [filePath, node] of graph.entries()) {
    largestCodeFiles.set(filePath, node.size);
  }
  return Array.from(largestCodeFiles.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
}

export function findCodeFilesAbove100KB(
  graph: Graph
): Array<[string, number]> {
  const codeFilesAbove100KB = new Map<string, number>();
  for (const [filePath, node] of graph.entries()) {
    if (node.size > 100 * 1024) {
      codeFilesAbove100KB.set(filePath, node.size);
    }
  }
  return Array.from(codeFilesAbove100KB.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
}

export function getTop10FilesWithHeavyDependencies(
  graph: Graph
): Array<[string, GraphNode]> {
  return Array.from(graph.entries())
    .sort((a, b) => b[1].imports.size - a[1].imports.size)
    .slice(0, 10);
}

export function getTop10FilesWithLightDependencies(
  graph: Graph
): Array<[string, GraphNode]> {
  return Array.from(graph.entries())
    .sort((a, b) => a[1].imports.size - b[1].imports.size)
    .filter(([, node]) => node.hash !== null)
    .slice(0, 10);
}

export function getTop10FilesHotspots(
  graph: AnyGraph,
  isCheck = true
): Array<[string, AnyNode]> {
  const entries = Array.from(graph as Map<string, AnyNode>);
  if (isCheck) {
    return entries
      .sort((a, b) => b[1].importedBy.size - a[1].importedBy.size)
      .slice(0, 10);
  } else {
    return entries
      .sort((a, b) => b[1].importedBy.size - a[1].importedBy.size)
      .filter(([, node]) => (node as ImageGraphNode).isImage === true)
      .slice(0, 10);
  }
}

export function getTop10FilesDependenciesHotspots(
  graph: Graph,
  isDependency = true
): Array<[string, GraphNode]> {
  if (isDependency) {
    return Array.from(graph.entries())
      .sort((a, b) => b[1].importedBy.size - a[1].importedBy.size)
      .filter(([, node]) => node.hash === null)
      .slice(0, 10);
  } else {
    return Array.from(graph.entries())
      .sort((a, b) => b[1].importedBy.size - a[1].importedBy.size)
      .filter(([, node]) => node.hash !== null)
      .slice(0, 10);
  }
}

export function getTotalImageFiles(graph: ImageGraph): number {
  let totalFiles = 0;
  for (const [, node] of graph.entries()) {
    if (node.isImage === true) {
      totalFiles++;
    }
  }
  return totalFiles;
}

/**
 * Returns the top 10 files that export the most files (re-export the most items)
 */
export function getTop10FilesWithMostReexports(
  graph: Graph
): Array<[string, GraphNode]> {
  return Array.from(graph.entries())
    .sort((a, b) => b[1].reExported.size - a[1].reExported.size)
    .slice(0, 10);
}

/**
 * Returns the top 10 files that have been exported most (re-exported by the most files)
 */
export function getTop10FilesWithMostReexportedBy(
  graph: Graph
): Array<[string, GraphNode]> {
  return Array.from(graph.entries())
    .sort((a, b) => b[1].reExportedBy.size - a[1].reExportedBy.size)
    .slice(0, 10);
}
