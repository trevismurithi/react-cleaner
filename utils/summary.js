function getDeadLinks(graph) {
    // get the dead links from the graph
    const deadLinks = new Map();
    const aliveLinks = new Map();
    for (const [filePath, node] of graph.entries()) {
        if (node.hash === null) {
            deadLinks.set(filePath, {...node});
        }else{
            aliveLinks.set(filePath, {...node});
        }
    }
    return {deadLinks, aliveLinks};
}

function getTotalImageSize(graph) {
    let totalSize = 0;
    for (const [filePath, node] of graph.entries()) {
        if (node.hash !== null) {
            totalSize += node.size;
        }
    }
    return totalSize;
}

function getTotalCodeSize(graph) {
    let totalSize = 0;
    for (const [filePath, node] of graph.entries()) {
        totalSize += node.size;
    }
    return totalSize;
}

function getTop10LargestImages(graph) {
    const largestImages = new Map();
    for (const [filePath, node] of graph.entries()) {
        largestImages.set(filePath, node.size);
    }
    return Array.from(largestImages.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
}

function getTop10LargestCodeFiles(graph) {
    const largestCodeFiles = new Map();
    for (const [filePath, node] of graph.entries()) {
        largestCodeFiles.set(filePath, node.size);
    }
    return Array.from(largestCodeFiles.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
}

function findCodeFilesAbove100KB(graph) {
    const codeFilesAbove100KB = new Map();
    for (const [filePath, node] of graph.entries()) {
        if (node.size > 100 * 1024) {
            codeFilesAbove100KB.set(filePath, node.size);
        }
    }
    return Array.from(codeFilesAbove100KB.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
}

function getTop10FilesWithHeavyDependencies(graph) {
    return Array.from(graph.entries()).sort((a, b) => b[1].imports.size - a[1].imports.size).slice(0, 10);
}

function getTop10FilesWithLightDependencies(graph) {
    return Array.from(graph.entries()).sort((a, b) => a[1].imports.size - b[1].imports.size).slice(0, 10);
}

function getTop10FilesHotspots(graph) {
    return Array.from(graph.entries()).sort((a, b) => b[1].importedBy.size - a[1].importedBy.size).slice(0, 10);
}

module.exports = {
    getDeadLinks,
    getTotalImageSize,
    getTotalCodeSize,
    getTop10LargestImages,
    getTop10LargestCodeFiles,
    findCodeFilesAbove100KB,
    getTop10FilesWithHeavyDependencies,
    getTop10FilesWithLightDependencies,
    getTop10FilesHotspots
};