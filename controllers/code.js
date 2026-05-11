const fs = require('fs');
const path = require('path');
const { hydrateGraph } = require('../utils/graphUtils');

function findUnusedExports() {
    const fileAssociated = new Map();
    const unUsedExportsWithPath = new Map();
    const unusedExports = new Set();
    const usedExports = new Set();
    // read file unused-check-cache.json
    const cache = JSON.parse(fs.readFileSync(path.join(process.cwd(), "unused-check-cache.json"), "utf8"));
    const graph = hydrateGraph(cache.parentGraph.graph);
    for(const [, node] of graph.entries()) {
        if(node.exports.size === 0) {
            continue
        }
        fileAssociated.set(node.file, new Set());
        findUnusedFlags(node, unusedExports, usedExports, graph, node.exports, unUsedExportsWithPath, node.file, fileAssociated);
    }
    return {unUsedExportsWithPath, fileAssociated};
}


function findUnusedFlags(node, unusedExports, usedExports, graph, exportedNames, unUsedExportsWithPath, currentFile, fileAssociated) {
    if(node.importedBy.size > 0) {
        for(const importedByFile of node.importedBy) {
            const importedNode = graph.get(importedByFile);
            const components = importedNode.imported.get(node.file);
            if(components.size === 0) {
                return
            }
            exportedNames.forEach(exportComponentName => {
                components.forEach(component => {
                    if(component.includes(exportComponentName) || component.includes('*')) {
                        usedExports.add(exportComponentName)
                        if(unusedExports.has(exportComponentName)) {
                            unusedExports.delete(exportComponentName)
                            unUsedExportsWithPath.delete(exportComponentName)
                            fileAssociated.delete(currentFile)
                        }
                        return
                    }
                })
                if(!usedExports.has(exportComponentName)) {
                    unusedExports.add(exportComponentName)
                    unUsedExportsWithPath.set(exportComponentName, currentFile)
                    fileAssociated.get(currentFile).add(importedByFile)
                }
            })
        }
    }

    if (node.reExportedBy.size > 0) {
        for(const reExportedByFile of node.reExportedBy) {
            const reExportedByNode = graph.get(reExportedByFile);
            if(fileAssociated.has(currentFile)) {
                fileAssociated.get(currentFile).add(reExportedByFile)
            }
            findUnusedFlags(reExportedByNode, unusedExports, usedExports, graph, exportedNames, unUsedExportsWithPath, currentFile, fileAssociated);
        }
    }
}

module.exports = {
    findUnusedExports
}