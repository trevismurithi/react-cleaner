const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/** Surgical-pass keys stored under `parentGraph.fixes` (content fingerprints per file). */
const FIX_PASS_KEYS = ["pruneInternal", "nukeConsoleLogs", "deduplicateLogic"];

const CACHE_FILE_NAME = "unused-check-cache.json";

/**
 * @param {unknown} fixes
 * @returns {{ pruneInternal: Record<string, string>, nukeConsoleLogs: Record<string, string>, deduplicateLogic: Record<string, string> }}
 */
function normalizeFixes(fixes) {
  const out = {
    pruneInternal: {},
    nukeConsoleLogs: {},
    deduplicateLogic: {},
  };
  if (!fixes || typeof fixes !== "object") {
    return out;
  }
  for (const passKey of FIX_PASS_KEYS) {
    if (
      fixes[passKey] &&
      typeof fixes[passKey] === "object" &&
      !Array.isArray(fixes[passKey])
    ) {
      out[passKey] = { ...fixes[passKey] };
    }
  }
  return out;
}

function fixesPayload(parentGraph) {
  return normalizeFixes(parentGraph?.fixes);
}

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
        fixes: fixesPayload(parentGraph),
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
        fixes: fixesPayload(parentGraph),
      },
      imageParentGraph: {
        imageGraph: imageGraphData,
        unusedImages: Array.from(imageParentGraph.unusedImages),
      },
    };

  return {
    parentGraph: {
      graph: parentGraph.graph,
      unusedFiles: Array.from(parentGraph.unusedFiles),
      fixes: fixesPayload(parentGraph),
    },
    imageParentGraph: {
      imageGraph: imageGraphData,
      unusedImages: Array.from(imageParentGraph.unusedImages),
    },
  };
}

function loadCache(rootPath, { clearCache, code }) {
  const file = path.join(rootPath, CACHE_FILE_NAME);
  const emptyParent = () => ({
    graph: {},
    unusedFiles: [],
    fixes: normalizeFixes(),
  });
  if (!fs.existsSync(file))
    return {
      parentGraph: emptyParent(),
      imageParentGraph: { imageGraph: {}, unusedImages: [] },
    };

  try {
    const cache = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!cache.parentGraph || !cache.imageParentGraph) {
      return {
        parentGraph: emptyParent(),
        imageParentGraph: { imageGraph: {}, unusedImages: [] },
      };
    }
    cache.parentGraph.fixes = normalizeFixes(cache.parentGraph.fixes);
    if (clearCache) {
      if (code) {
        cache.parentGraph = {
          graph: {},
          unusedFiles: [],
          fixes: normalizeFixes(),
        };
      } else {
        cache.imageParentGraph = { imageGraph: {}, unusedImages: [] };
      }
      fs.writeFileSync(file, JSON.stringify(cache, null, 2));
    }
    return cache;
  } catch {
    return {
      parentGraph: emptyParent(),
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

/**
 * Read cache JSON or a minimal skeleton (preserves existing graph when updating fixes only).
 * @param {string} rootPath
 */
function readFullCacheOrSkeleton(rootPath) {
  const file = path.join(rootPath, CACHE_FILE_NAME);
  const skeleton = {
    parentGraph: {
      graph: {},
      unusedFiles: [],
      fixes: normalizeFixes(),
    },
    imageParentGraph: { imageGraph: {}, unusedImages: [] },
  };
  if (!fs.existsSync(file)) {
    return skeleton;
  }
  try {
    const cache = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!cache.parentGraph) cache.parentGraph = skeleton.parentGraph;
    if (!cache.imageParentGraph) cache.imageParentGraph = skeleton.imageParentGraph;
    cache.parentGraph.fixes = normalizeFixes(cache.parentGraph.fixes);
    return cache;
  } catch {
    return skeleton;
  }
}

/**
 * Persist content hash for one file under `parentGraph.fixes[passKey]` (for surgical-pass skip).
 * @param {string} rootPath
 * @param {string} passKey
 * @param {string} absolutePath
 * @param {string} contentHash
 */
function updateFixPassEntry(rootPath, passKey, absolutePath, contentHash) {
  if (!FIX_PASS_KEYS.includes(passKey)) {
    return;
  }
  const cache = readFullCacheOrSkeleton(rootPath);
  cache.parentGraph.fixes[passKey][absolutePath] = contentHash;
  fs.writeFileSync(
    path.join(rootPath, CACHE_FILE_NAME),
    JSON.stringify(cache, null, 2),
  );
}

/**
 * @param {string} rootPath
 * @param {string} passKey
 * @returns {Map<string, string>}
 */
function getFixPassHashes(rootPath, passKey) {
  const cache = readFullCacheOrSkeleton(rootPath);
  const obj = cache.parentGraph.fixes[passKey] || {};
  return new Map(Object.entries(obj));
}

function saveCache(rootPath, { parentGraph, imageParentGraph }, isCode = true) {
  const file = path.join(rootPath, CACHE_FILE_NAME);
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
  const file = path.join(rootPath, CACHE_FILE_NAME);
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
  normalizeFixes,
  FIX_PASS_KEYS,
  updateFixPassEntry,
  getFixPassHashes,
};
