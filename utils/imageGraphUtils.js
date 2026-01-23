const fs = require("fs");
const { getFileHash } = require("./cache");

/**
 * Adds an image file to the image graph if it doesn't already exist
 * @param {string} importPath - The path to the image file
 * @param {Map} imageGraph - The image graph Map
 */
function addToImageGraph(importPath, imageGraph) {
  if (importPath && !imageGraph.has(importPath)) {
    let size = 0;
    let hash = null;
    let lastModified = null;
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
 * @param {string} filePath - The path to the file
 * @param {string} cssContent - The CSS content (for hash calculation)
 * @param {Map} imageGraph - The image graph Map
 */
function createFileNodeInImageGraph(filePath, cssContent, imageGraph) {
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
    imageGraph.get(filePath).imports.clear();
    imageGraph.get(filePath).hash = hash;
    imageGraph.get(filePath).lastModified = fs.statSync(filePath).mtime.getTime();
    imageGraph.get(filePath).importedBy.clear();
  }
}

/**
 * Creates an image node in the image graph from a CSS import
 * @param {string} importPath - The path to the image file
 * @param {Map} imageGraph - The image graph Map
 */
function createImageNodeFromCssImport(importPath, imageGraph) {
  if (importPath && !imageGraph.has(importPath)) {
    let size = 0;
    let hash = null;
    let lastModified = null;
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

module.exports = {
  addToImageGraph,
  createFileNodeInImageGraph,
  createImageNodeFromCssImport,
};
