const fs = require("fs");
const path = require("path");
const { needsRebuild } = require("./cache");
const { parseCode, extractImportsAndExports } = require("./astParser");
const {
  createFileNode,
  createModuleNode,
  createImportNode,
  createReExportNode,
  ensureGraphNode,
  storeOldGraphState,
} = require("./graphOperations");
const { createStepBar } = require("./utils");

/**
 * Scans files and extracts imports/exports from AST
 * @param {Array<string>} files - Array of file paths to scan
 * @param {Map} graph - The dependency graph
 * @param {Object} chalk - Chalk instance for progress bar
 * @returns {Object} Object containing imports, exports, and old state maps
 */
async function scanFilesForImportsAndExports(files, graph, chalk) {
  const scanBar = createStepBar(
    `1/${files.length}`,
    files.length,
    "Scanning files",
    chalk
  );

  const imports = [];
  const exports = [];
  const oldPaths = new Map();
  const oldExports = new Map();
  const oldReExported = new Map();

  for (const file of files) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    scanBar.increment();

    const filePath = path.resolve(file);
    const code = fs.readFileSync(filePath, "utf8");
    const isNeedsRebuild = needsRebuild(filePath, code, graph);

    if (isNeedsRebuild) {
      const ast = parseCode(code);

      // Store old graph state if file exists in graph
      if (graph.has(filePath)) {
        const oldState = storeOldGraphState(graph, filePath);
        if (oldState.oldPaths) {
          oldPaths.set(filePath, oldState.oldPaths);
        }
        if (oldState.oldExports) {
          oldExports.set(filePath, oldState.oldExports);
        }
        if (oldState.oldReExported) {
          oldReExported.set(filePath, oldState.oldReExported);
        }
      }

      // Create or reset file graph node
      graph.set(filePath, createFileNode(filePath, code));

      // Extract imports and exports from AST
      const { imports: fileImports, exports: fileExports } =
        extractImportsAndExports(ast, filePath);
      imports.push(...fileImports);
      exports.push(...fileExports);
    }
  }

  scanBar.stop();
  return { imports, exports, oldPaths, oldExports, oldReExported };
}

/**
 * Processes imports and adds them to the graph
 * @param {Array<Object>} imports - Array of import info objects
 * @param {Map} graph - The dependency graph
 * @param {Function} resolver - Resolver function to resolve import paths
 * @param {Object} chalk - Chalk instance for progress bar
 */
async function processImports(imports, graph, resolver, chalk) {
  if (imports.length === 0) {
    return;
  }

  const packingBar = createStepBar(
    `1/${imports.length}`,
    imports.length,
    "Packing imports",
    chalk
  );

  for (const info of imports) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    packingBar.increment();

    const { importPath, isMightBeModule } = await resolver(
      info.file,
      info.source
    );

    graph.get(info.file).imports.add(importPath);

    if (!isMightBeModule) {
      ensureGraphNode(graph, importPath, createImportNode);
    } else {
      ensureGraphNode(graph, importPath, createModuleNode);
    }

    graph.get(importPath).importedBy.add(info.file);
  }

  packingBar.stop();
}

/**
 * Processes exports and adds them to the graph
 * @param {Array<Object>} exports - Array of export info objects
 * @param {Map} graph - The dependency graph
 * @param {Function} resolver - Resolver function to resolve export paths
 * @param {Object} chalk - Chalk instance for progress bar
 */
async function processExports(exports, graph, resolver, chalk) {
  if (exports.length === 0) {
    return;
  }
  const packingBarExports = createStepBar(
    `1/${exports.length}`,
    exports.length,
    "Packing exports",
    chalk
  );

  for (const exportInfo of exports) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    packingBarExports.increment();

    let exportPath = null;
    let isMightBeModule = null;

    if (exportInfo.source) {
      const pathInfo = await resolver(exportInfo.file, exportInfo.source);
      exportPath = pathInfo.importPath;
      isMightBeModule = pathInfo.isMightBeModule;
    }

    if (!isMightBeModule && isMightBeModule !== null) {
      // Re-export from a file
      graph.get(exportInfo.file).reExported.add(exportPath);
      ensureGraphNode(graph, exportPath, createReExportNode);
      graph.get(exportPath).reExportedBy.add(exportInfo.file);
    } else {
      // Two cases: module re-export or local export
      if (isMightBeModule) {
        // Re-export from a module
        graph.get(exportInfo.file).reExported.add(exportPath);
        ensureGraphNode(graph, exportPath, createModuleNode);
        graph.get(exportPath).reExportedBy.add(exportInfo.file);
      } else {
        // Local export (function, variable, etc.)
        exportInfo.names.forEach((name) => {
          graph.get(exportInfo.file).exports.add(name);
        });
      }
    }
  }

  packingBarExports.stop();
}

module.exports = {
  scanFilesForImportsAndExports,
  processImports,
  processExports,
};
