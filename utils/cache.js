const fs = require('fs');
const path = require('path');
const crypto = require('crypto');


function loadCache(rootPath) {
    const file = path.join(rootPath, "unused-check-cache.json");
    if(!fs.existsSync(file)) return {};

    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch{
        return {};
    }
}

function getFileHash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
}


function needsRebuild(file, content, cache) {
    const hash = getFileHash(content);
    return !cache[file] || cache[file].hash !== hash
}


function saveCache(rootPath, cache) {
    const file = path.join(rootPath, "unused-check-cache.json");
    fs.writeFileSync(file, JSON.stringify(cache, null, 2))
}

module.exports = {
    loadCache,
    getFileHash,
    needsRebuild,
    saveCache
}