import fs from "fs";
import { getFileHash } from "./cache";
import type { ImageGraph } from "../types";

/**
 * Adds an image file to the image graph if it doesn't already exist
 * @param importPath - The path to the image file
 * @param imageGraph - The image graph Map
 */
export function addToImageGraph(
  importPath: string | null | undefined,
  imageGraph: ImageGraph
): void {
  if (importPath && !imageGraph.has(importPath)) {
    let size = 0;
    let hash: string | null = null;
    let lastModified: number | null = null;
    try {
      size = fs.statSync(importPath).size;
      hash = getFileHash(fs.readFileSync(importPath, "utf8"));
      lastModified = fs.statSync(importPath).mtime.getTime();
    } catch {
      size = 0;
      hash = null;
      lastModified = null;
    }
    imageGraph.set(importPath, {
      file: importPath,
      size: size,
      hash: hash,
      imports: new Set(),
      importedBy: new Set(),
      lastModified: lastModified,
      isImage: true,
    });
  }
}

/**
 * Creates a file node in the image graph
 * @param filePath - The path to the file
 * @param cssContent - The CSS content (for hash calculation)
 * @param imageGraph - The image graph Map
 */
export function createFileNodeInImageGraph(
  filePath: string,
  cssContent: string,
  imageGraph: ImageGraph
): void {
  const hash = getFileHash(cssContent);
  if (!imageGraph.has(filePath)) {
    imageGraph.set(filePath, {
      file: filePath,
      size: fs.statSync(filePath).size,
      hash: hash,
      imports: new Set(),
      importedBy: new Set(),
      lastModified: fs.statSync(filePath).mtime.getTime(),
      isImage: false,
    });
  } else {
    const node = imageGraph.get(filePath)!;
    node.imports.clear();
    node.hash = hash;
    node.lastModified = fs.statSync(filePath).mtime.getTime();
    node.importedBy.clear();
  }
}

/**
 * Creates an image node in the image graph from a CSS import
 * @param importPath - The path to the image file
 * @param imageGraph - The image graph Map
 */
export function createImageNodeFromCssImport(
  importPath: string | null | undefined,
  imageGraph: ImageGraph
): void {
  if (importPath && !imageGraph.has(importPath)) {
    let size = 0;
    let hash: string | null = null;
    let lastModified: number | null = null;
    try {
      size = fs.statSync(importPath).size;
      hash = getFileHash(fs.readFileSync(importPath, "utf8"));
      lastModified = fs.statSync(importPath).mtime.getTime();
    } catch {
      size = 0;
      hash = null;
      lastModified = null;
    }
    imageGraph.set(importPath, {
      file: importPath,
      size: size,
      hash: hash,
      imports: new Set(),
      importedBy: new Set(),
      lastModified: lastModified,
      isImage: true,
    });
  }
}
