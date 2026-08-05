import fs from "fs";
import path from "path";
import crypto from "crypto";
import type {
  CacheFile,
  Fixes,
  FixPassKey,
  GraphNode,
  ImageParentGraph,
  ParentGraph,
  SerializedGraphNode,
  SerializedImageGraphNode,
} from "../types";

/** Surgical-pass keys stored under `parentGraph.fixes` (content fingerprints per file). */
export const FIX_PASS_KEYS: FixPassKey[] = [
  "pruneInternal",
  "nukeConsoleLogs",
  "deduplicateLogic",
];

const CACHE_FILE_NAME = "unused-check-cache.json";

/**
 * @param fixes
 * @returns Normalized fixes object with all pass keys present
 */
export function normalizeFixes(fixes?: unknown): Fixes {
  const out: Fixes = {
    pruneInternal: {},
    nukeConsoleLogs: {},
    deduplicateLogic: {},
  };
  if (!fixes || typeof fixes !== "object") {
    return out;
  }
  const fixesRecord = fixes as Partial<Record<FixPassKey, unknown>>;
  for (const passKey of FIX_PASS_KEYS) {
    const passValue = fixesRecord[passKey];
    if (
      passValue &&
      typeof passValue === "object" &&
      !Array.isArray(passValue)
    ) {
      out[passKey] = { ...(passValue as Record<string, string>) };
    }
  }
  return out;
}

function fixesPayload(parentGraph: ParentGraph | { fixes?: unknown }): Fixes {
  return normalizeFixes(parentGraph?.fixes);
}

function serializeImported(
  importedMap: GraphNode["imported"]
): SerializedGraphNode["imported"] {
  const serializedImported: SerializedGraphNode["imported"] = {};
  for (const [filePath, data] of importedMap) {
    serializedImported[filePath] = Array.from(data);
  }
  return serializedImported;
}

function serializeGraph({
  parentGraph,
  imageParentGraph,
  isCode = true,
}: {
  parentGraph: ParentGraph;
  imageParentGraph: ImageParentGraph;
  isCode?: boolean;
}): CacheFile {
  const graphData: Record<string, SerializedGraphNode> = {};
  const imageGraphData: Record<string, SerializedImageGraphNode> = {};
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
        imageGraph: imageParentGraph.imageGraph as unknown as Record<
          string,
          SerializedImageGraphNode
        >,
        unusedImages: Array.from(imageParentGraph.unusedImages),
      },
    };

  if (Object.keys(imageGraphData).length > 0)
    return {
      parentGraph: {
        graph: parentGraph.graph as unknown as Record<string, SerializedGraphNode>,
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
      graph: parentGraph.graph as unknown as Record<string, SerializedGraphNode>,
      unusedFiles: Array.from(parentGraph.unusedFiles),
      fixes: fixesPayload(parentGraph),
    },
    imageParentGraph: {
      imageGraph: imageGraphData,
      unusedImages: Array.from(imageParentGraph.unusedImages),
    },
  };
}

export function loadCache(
  rootPath: string,
  { clearCache, code }: { clearCache?: boolean; code?: boolean }
): CacheFile {
  const file = path.join(rootPath, CACHE_FILE_NAME);
  const emptyParent = () => ({
    graph: {},
    unusedFiles: [] as CacheFile["parentGraph"]["unusedFiles"],
    fixes: normalizeFixes(),
  });
  if (!fs.existsSync(file))
    return {
      parentGraph: emptyParent(),
      imageParentGraph: { imageGraph: {}, unusedImages: [] },
    };

  try {
    const cache = JSON.parse(fs.readFileSync(file, "utf8")) as CacheFile;
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

export function getFileHash(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex");
}

export function needsRebuild(
  file: string,
  content: string,
  cache: Map<string, { hash: string | null }>
): boolean {
  const hash = getFileHash(content);
  return !cache.has(file) || cache.get(file)!.hash !== hash;
}

/**
 * Read cache JSON or a minimal skeleton (preserves existing graph when updating fixes only).
 */
function readFullCacheOrSkeleton(rootPath: string): CacheFile {
  const file = path.join(rootPath, CACHE_FILE_NAME);
  const skeleton: CacheFile = {
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
    const cache = JSON.parse(fs.readFileSync(file, "utf8")) as CacheFile;
    if (!cache.parentGraph) cache.parentGraph = skeleton.parentGraph;
    if (!cache.imageParentGraph)
      cache.imageParentGraph = skeleton.imageParentGraph;
    cache.parentGraph.fixes = normalizeFixes(cache.parentGraph.fixes);
    return cache;
  } catch {
    return skeleton;
  }
}

/**
 * Persist content hash for one file under `parentGraph.fixes[passKey]` (for surgical-pass skip).
 */
export function updateFixPassEntry(
  rootPath: string,
  passKey: FixPassKey,
  absolutePath: string,
  contentHash: string
): void {
  if (!FIX_PASS_KEYS.includes(passKey)) {
    return;
  }
  const cache = readFullCacheOrSkeleton(rootPath);
  cache.parentGraph.fixes[passKey][absolutePath] = contentHash;
  fs.writeFileSync(
    path.join(rootPath, CACHE_FILE_NAME),
    JSON.stringify(cache, null, 2)
  );
}

export function getFixPassHashes(
  rootPath: string,
  passKey: FixPassKey
): Map<string, string> {
  const cache = readFullCacheOrSkeleton(rootPath);
  const obj = cache.parentGraph.fixes[passKey] || {};
  return new Map(Object.entries(obj));
}

export function saveCache(
  rootPath: string,
  {
    parentGraph,
    imageParentGraph,
  }: { parentGraph: ParentGraph; imageParentGraph: ImageParentGraph },
  isCode = true
): void {
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

export function clearCache(rootPath: string): void {
  const file = path.join(rootPath, CACHE_FILE_NAME);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}
