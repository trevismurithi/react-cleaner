function findFilesByDependency(graph, dependency) {
    return graph.get(dependency)?.importedBy;
  }

function findUnusedDependencies(graph, dependencies) {
    const unusedDependencies = [];
    for(const dependency of dependencies) {
        if(!graph.get(dependency)) {
            unusedDependencies.push(dependency);
        }
    }
    return unusedDependencies;
}
  
  module.exports = {
    findFilesByDependency,
    findUnusedDependencies,
  };