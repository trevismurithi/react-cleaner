import type { Graph } from "../types";

export function findFilesByDependency(
  graph: Graph,
  dependency: string
): Set<string> {
  // collect all files that match the dependency
  let matchingFiles = new Set<string>();
  // break down the dependency string into an array
  const dependencyArray = dependency.split("/");
  // check if all parts of the dependency exist in the graph
  // loop through the graph on the entries do the check on each part
  for (const [file, node] of graph.entries()) {
    if (dependencyArray.every((part) => file.includes(part))) {
      matchingFiles = new Set([...matchingFiles, ...node.importedBy]);
    }
  }
  return matchingFiles;
}

export function findUnusedDependencies(
  graph: Graph,
  dependencies: Iterable<string>
): Set<string> {
  const unusedDependencies = new Set<string>();
  for (const dependency of dependencies) {
    const matchingFiles = findFilesByDependency(graph, dependency);
    if (matchingFiles.size === 0) {
      unusedDependencies.add(dependency);
    }
  }
  return unusedDependencies;
}
