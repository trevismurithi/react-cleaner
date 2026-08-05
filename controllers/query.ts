import {
  findFilesByDependency,
  findUnusedDependencies,
} from "../utils/query";
import type { Graph } from "../types";

export function query(graph: Graph, dependency: string): Set<string> {
  return findFilesByDependency(graph, dependency);
}

export function unusedDependencies(
  graph: Graph,
  dependencies: Iterable<string>
): Set<string> {
  return findUnusedDependencies(graph, dependencies);
}
