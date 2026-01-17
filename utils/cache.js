const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function serializeImported(importedMap) {
  const serializedImported = {};
  for (const [filePath, data] of importedMap) {
    serializedImported[filePath] = Array.from(data);
  }
  return serializedImported;
}

function serializeGraph({ parentGraph, imageParentGraph, isCode = true }) {
  const graphData = {};
  const imageGraphData = {};
  if (isCode) {
    for (const [file, node] of parentGraph.graph.entries()) {
      graphData[file] = {
        ...node,
        imports: node.imports ? Array.from(node.imports) : [],
        importedBy: node.importedBy ? Array.from(node.importedBy) : [],
        exports: node.exports ? Array.from(node.exports) : [],
        reExported: node.reExported ? Array.from(node.reExported) : [],
        reExportedBy: node.reExportedBy ? Array.from(node.reExportedBy) : [],
        imported: serializeImported(node.imported),
      };
    }
  } else {
    for (const [file, node] of imageParentGraph.imageGraph.entries()) {
      imageGraphData[file] = {
        ...node,
        imports: node.imports ? Array.from(node.imports) : [],
        importedBy: node.importedBy ? Array.from(node.importedBy) : [],
        exports: node.exports ? Array.from(node.exports) : [],
        reExported: node.reExported ? Array.from(node.reExported) : [],
        reExportedBy: node.reExportedBy ? Array.from(node.reExportedBy) : [],
      };
    }
  }
  if (Object.keys(graphData).length > 0)
    return {
      parentGraph: {
        graph: graphData,
        unusedFiles: Array.from(parentGraph.unusedFiles),
      },
      imageParentGraph: {
        imageGraph: imageParentGraph.imageGraph,
        unusedImages: Array.from(imageParentGraph.unusedImages),
      },
    };
  if (Object.keys(imageGraphData).length > 0)
    return {
      parentGraph: {
        graph: parentGraph.graph,
        unusedFiles: Array.from(parentGraph.unusedFiles),
      },
      imageParentGraph: {
        imageGraph: imageGraphData,
        unusedImages: Array.from(imageParentGraph.unusedImages),
      },
    };
}

function loadCache(rootPath, {clearCache, code}) {
  const file = path.join(rootPath, "unused-check-cache.json");
  if (!fs.existsSync(file))
    return {
      parentGraph: { graph: {}, unusedFiles: [] },
      imageParentGraph: { imageGraph: {}, unusedImages: [] },
    };

  try {
    const cache = JSON.parse(fs.readFileSync(file, "utf8"));
    if(!cache.parentGraph || !cache.imageParentGraph){
      return {
        parentGraph: { graph: {}, unusedFiles: [] },
        imageParentGraph: { imageGraph: {}, unusedImages: [] },
      };
    }
    if(clearCache) {
      if(code) {
        cache.parentGraph = { graph: {}, unusedFiles: [] };
      } else {
        cache.imageParentGraph = { imageGraph: {}, unusedImages: [] };
      }
      fs.writeFileSync(file, JSON.stringify(cache, null, 2));
    }
    return cache;
  } catch {
    return {
      parentGraph: { graph: {}, unusedFiles: [] },
        imageParentGraph: { imageGraph: {}, unusedImages: [] },
      };
  }
}

function getFileHash(content) {
  return crypto.createHash("md5").update(content).digest("hex");
}

function needsRebuild(file, content, cache) {
  const hash = getFileHash(content);
  return !cache.has(file) || cache.get(file).hash !== hash;
}

function saveCache(rootPath, { parentGraph, imageParentGraph }, isCode = true) {
  const file = path.join(rootPath, "unused-check-cache.json");
  fs.writeFileSync(
    file,
    JSON.stringify(
      serializeGraph({ parentGraph, imageParentGraph, isCode }),
      null,
      2
    )
  );
}

function clearCache(rootPath) {
  const file = path.join(rootPath, "unused-check-cache.json");
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

module.exports = {
  loadCache,
  getFileHash,
  needsRebuild,
  saveCache,
  clearCache,
};
