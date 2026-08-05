import fs from "fs";
import { getFileHash } from "./cache";
import type { Graph, GraphNode } from "../types";

/**
 * Creates a new graph node for a file
 * @param filePath - The path of the file
 * @param code - The file content (optional, for hash calculation)
 */
export function createFileNode(
  filePath: string,
  code: string | null = null
): GraphNode {
  const stats = fs.statSync(filePath);
  return {
    file: filePath,
    hash: code ? getFileHash(code) : null,
    imports: new Set(),
    imported: new Map(),
    importedBy: new Set(),
    exports: new Set(),
    reExportedBy: new Set(),
    reExported: new Set(),
    lastModified: stats.mtime.getTime(),
    size: stats.size,
  };
}

/**
 * Creates a graph node for a module (external dependency)
 * @param modulePath - The module path
 */
export function createModuleNode(modulePath: string): GraphNode {
  return {
    file: modulePath,
    size: 0,
    hash: null,
    imports: new Set(),
    imported: new Map(),
    importedBy: new Set(),
    exports: new Set(),
    reExportedBy: new Set(),
    reExported: new Set(),
    lastModified: null,
  };
}

/**
 * Creates a graph node for an imported file
 * @param importPath - The path of the imported file
 */
export function createImportNode(importPath: string): GraphNode {
  if (!fs.existsSync(importPath)) {
    return {
      file: importPath,
      size: 0,
      hash: null,
      imports: new Set(),
      imported: new Map(),
      importedBy: new Set(),
      exports: new Set(),
      reExportedBy: new Set(),
      reExported: new Set(),
      lastModified: null,
    };
  }
  const stats = fs.statSync(importPath);
  const code = fs.readFileSync(importPath, "utf8");
  return {
    file: importPath,
    size: stats.size,
    hash: getFileHash(code),
    imports: new Set(),
    imported: new Map(),
    importedBy: new Set(),
    exports: new Set(),
    reExportedBy: new Set(),
    reExported: new Set(),
    lastModified: stats.mtime.getTime(),
  };
}

/**
 * Creates a graph node for a re-exported file
 * @param exportPath - The path of the re-exported file
 */
export function createReExportNode(exportPath: string): GraphNode {
  const stats = fs.statSync(exportPath);
  const code = fs.readFileSync(exportPath, "utf8");
  return {
    file: exportPath,
    size: stats.size,
    hash: getFileHash(code),
    imports: new Set(),
    imported: new Map(),
    importedBy: new Set(),
    exports: new Set(),
    reExportedBy: new Set(),
    reExported: new Set(),
    lastModified: stats.mtime.getTime(),
  };
}

/**
 * Ensures a graph node exists, creating it if it doesn't
 * @param graph - The graph Map
 * @param filePath - The file path
 * @param createNodeFn - Function to create the node if it doesn't exist
 */
export function ensureGraphNode<T extends GraphNode>(
  graph: Map<string, T>,
  filePath: string,
  createNodeFn: (filePath: string) => T
): T {
  if (!graph.has(filePath)) {
    graph.set(filePath, createNodeFn(filePath));
  }
  return graph.get(filePath)!;
}

export interface OldGraphState {
  oldPaths: Set<string> | null;
  oldExports: Set<string> | null;
  oldReExported: Set<string> | null;
}

/**
 * Stores old graph state for a file before rebuilding
 * @param graph - The graph Map
 * @param filePath - The file path
 */
export function storeOldGraphState(
  graph: Graph,
  filePath: string
): OldGraphState {
  if (!graph.has(filePath)) {
    return {
      oldPaths: null,
      oldExports: null,
      oldReExported: null,
    };
  }

  const node = graph.get(filePath)!;
  return {
    oldPaths: new Set(node.imports),
    oldExports: new Set(node.exports),
    oldReExported: new Set(node.reExported),
  };
}
