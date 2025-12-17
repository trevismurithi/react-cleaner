const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function serializeGraph({graph, imageGraph}) {
    const out = {};
    for (const [file, node] of graph.entries()) {
      out[file] = {
        ...node,
        imports: node.imports?Array.from(node.imports):[],
        importedBy: node.importedBy?Array.from(node.importedBy):[],
      };
    }
  
    return {graph: out, imageGraph};
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


function saveCache(rootPath, cache) {
    const file = path.join(rootPath, "unused-check-cache.json");
    fs.writeFileSync(file, JSON.stringify(serializeGraph(cache), null, 2))
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