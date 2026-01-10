const { findFilesByDependency, findUnusedDependencies } = require("../utils/query");


function query(graph, dependency) {
  return findFilesByDependency(graph, dependency);
}

function unusedDependencies(graph, dependencies) {
  return findUnusedDependencies(graph, dependencies);
}

module.exports = {
  query,
  unusedDependencies,
};
