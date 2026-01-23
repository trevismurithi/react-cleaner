function hydrateImported(importedData) {
  const imported = new Map()
  const files = Object.assign({},importedData)
  for (const [file, components] of Object.entries(files)) {
    imported.set(file, new Set(components))
  }
  return imported
}
/**
 * Hydrates a graph from serialized data by converting arrays back to Sets
 * @param {Object} graphData - Serialized graph data with arrays instead of Sets
 * @returns {Map} Hydrated graph Map with Sets restored
 */
function hydrateGraph(graphData) {
  const graph = new Map();
  for (const [file, data] of Object.entries(graphData)) {
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

module.exports = {
  hydrateGraph,
};
