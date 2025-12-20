const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function serializeGraph({graph, imageGraph, isCode=true}) {
    const graphData = {};
    const imageGraphData = {};
    if(isCode){
        for (const [file, node] of graph.entries()) {
            graphData[file] = {
              ...node,
              imports: node.imports?Array.from(node.imports):[],
              importedBy: node.importedBy?Array.from(node.importedBy):[],
            };
          }

    }else{
        for (const [file, node] of imageGraph.entries()) {
            imageGraphData[file] = {
              ...node,
              imports: node.imports?Array.from(node.imports):[],
              importedBy: node.importedBy?Array.from(node.importedBy):[],
            };
          }
    }
    if(Object.keys(graphData).length > 0) return {graph: graphData, imageGraph};
    if(Object.keys(imageGraphData).length > 0) return {graph, imageGraph: imageGraphData};
  }

function loadCache(rootPath) {
    const file = path.join(rootPath, "unused-check-cache.json");
    if(!fs.existsSync(file)) return {graph: {}, imageGraph: {}};

    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch{
        return {graph: {}, imageGraph: {}};
    }
}

function getFileHash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
}


function needsRebuild(file, content, cache) {
    const hash = getFileHash(content);
    return !cache.has(file) || cache.get(file).hash !== hash
}


function saveCache(rootPath, cache, isCode=true) {
    const file = path.join(rootPath, "unused-check-cache.json");
    fs.writeFileSync(file, JSON.stringify(serializeGraph(cache, isCode), null, 2))
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
    clearCache
}