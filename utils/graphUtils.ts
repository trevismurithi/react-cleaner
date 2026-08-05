import type {
  Graph,
  GraphNode,
  SerializedGraphNode,
} from "../types";

function hydrateImported(
  importedData: SerializedGraphNode["imported"] | Record<string, unknown>
): GraphNode["imported"] {
  const imported: GraphNode["imported"] = new Map();
  const files = Object.assign({}, importedData) as SerializedGraphNode["imported"];
  for (const [file, components] of Object.entries(files)) {
    imported.set(file, new Set(components));
  }
  return imported;
}

/**
 * Hydrates a graph from serialized data by converting arrays back to Sets
 * @param graphData - Serialized graph data with arrays instead of Sets
 * @returns Hydrated graph Map with Sets restored
 */
export function hydrateGraph(
  graphData: Record<string, SerializedGraphNode> | Record<string, unknown>
): Graph {
  const graph: Graph = new Map();
  for (const [file, raw] of Object.entries(graphData)) {
    const data = raw as SerializedGraphNode;
    graph.set(file, {
      ...data,
      imports: new Set(data.imports || []),
      importedBy: new Set(data.importedBy || []),
      imported: hydrateImported(data.imported || {}),
      exports: new Set(data.exports || []),
      reExportedBy: new Set(data.reExportedBy || []),
      reExported: new Set(data.reExported || []),
    });
  }
  return graph;
}
