const fs = require("fs");
const { getFileHash } = require("./cache");

/**
 * Creates a new graph node for a file
 * @param {string} filePath - The path of the file
 * @param {string} code - The file content (optional, for hash calculation)
 * @returns {Object} Graph node object
 */
function createFileNode(filePath, code = null) {
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
 * @param {string} modulePath - The module path
 * @returns {Object} Graph node object for a module
 */
function createModuleNode(modulePath) {
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
 * @param {string} importPath - The path of the imported file
 * @returns {Object} Graph node object
 */
function createImportNode(importPath) {
  if (!fs.existsSync(importPath)) {
    return {
      file: importPath,
      size: 0,
      hash: null,
      imports: new Set(),
      imported: new Map(),
      importedBy: new Set(),
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
    lastModified: stats.mtime.getTime(),
  };
}

/**
 * Creates a graph node for a re-exported file
 * @param {string} exportPath - The path of the re-exported file
 * @returns {Object} Graph node object
 */
function createReExportNode(exportPath) {
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
 * @param {Map} graph - The graph Map
 * @param {string} filePath - The file path
 * @param {Function} createNodeFn - Function to create the node if it doesn't exist
 * @returns {Object} The graph node
 */
function ensureGraphNode(graph, filePath, createNodeFn) {
  if (!graph.has(filePath)) {
    graph.set(filePath, createNodeFn(filePath));
  }
  return graph.get(filePath);
}

/**
 * Stores old graph state for a file before rebuilding
 * @param {Map} graph - The graph Map
 * @param {string} filePath - The file path
 * @returns {Object} Object containing old paths, exports, and reExported sets
 */
function storeOldGraphState(graph, filePath) {
  if (!graph.has(filePath)) {
    return {
      oldPaths: null,
      oldExports: null,
      oldReExported: null,
    };
  }

  const node = graph.get(filePath);
  return {
    oldPaths: new Set(node.imports),
    oldExports: new Set(node.exports),
    oldReExported: new Set(node.reExported),
  };
}

module.exports = {
  createFileNode,
  createModuleNode,
  createImportNode,
  createReExportNode,
  ensureGraphNode,
  storeOldGraphState,
};
