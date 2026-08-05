import fs from "fs";
import path from "path";
import { parse } from "@vue/compiler-sfc";
import type { Graph, ChalkInstance } from "../types";
import { needsRebuild } from "./cache";
import {
  parseCode,
  extractImportsAndExports,
  analyzeFileWithSWC,
  type ImportInfo,
  type ExportInfo,
} from "./astParser";
import {
  createFileNode,
  createModuleNode,
  createImportNode,
  createReExportNode,
  ensureGraphNode,
  storeOldGraphState,
} from "./graphOperations";
import { timed } from "./utils";
import type { ImportResolver } from "./resolver";

/**
 * Scans files and extracts imports/exports from AST
 */
export async function scanFilesForImportsAndExports(
  files: string[],
  graph: Graph,
  chalk: ChalkInstance | unknown
): Promise<{
  imports: ImportInfo[];
  exports: ExportInfo[];
  oldPaths: Map<string, Set<string>>;
  oldExports: Map<string, Set<string>>;
  oldReExported: Map<string, Set<string>>;
}> {
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];
  const oldPaths = new Map<string, Set<string>>();
  const oldExports = new Map<string, Set<string>>();
  const oldReExported = new Map<string, Set<string>>();

  await timed(
    "Scanning files",
    () => {
      for (const file of files) {
        try {
          const filePath = path.resolve(file);
          const code = fs.readFileSync(filePath, "utf8");
          const isNeedsRebuild = needsRebuild(filePath, code, graph);

          if (isNeedsRebuild) {
            const extension = path.extname(filePath);

            if (graph.has(filePath)) {
              const oldState = storeOldGraphState(graph, filePath);
              if (oldState.oldPaths) {
                oldPaths.set(filePath, oldState.oldPaths);
              }
              if (oldState.oldExports) {
                oldExports.set(filePath, oldState.oldExports);
              }
              if (oldState.oldReExported) {
                oldReExported.set(filePath, oldState.oldReExported);
              }
            }

            graph.set(filePath, createFileNode(filePath, code));
            if (extension === ".vue") {
              const { descriptor } = parse(code);
              if (descriptor.scriptSetup || descriptor.script) {
                const vueScriptLang =
                  descriptor.scriptSetup?.lang || descriptor.script?.lang || "";
                const ast = parseCode(
                  descriptor.scriptSetup?.content ||
                    descriptor.script?.content ||
                    "",
                  filePath,
                  vueScriptLang
                );
                const { imports: fileImports, exports: fileExports } =
                  extractImportsAndExports(ast, filePath);
                imports.push(...fileImports);
                exports.push(...fileExports);
              }
            } else {
              const { imports: fileImports, exports: fileExports } =
                analyzeFileWithSWC(code, filePath);
              imports.push(...fileImports);
              exports.push(...fileExports);
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Error processing file ${file}: ${message}`);
        }
      }
    },
    chalk
  );

  return { imports, exports, oldPaths, oldExports, oldReExported };
}

/**
 * Processes imports and adds them to the graph
 */
export async function processImports(
  imports: ImportInfo[],
  graph: Graph,
  resolver: ImportResolver,
  chalk: ChalkInstance | unknown
): Promise<void> {
  if (imports.length === 0) {
    return;
  }

  await timed(
    "Packing imports",
    async () => {
      for (const info of imports) {
        const { importPath, isMightBeModule } = await resolver(
          info.file,
          info.source as string
        );

        graph.get(info.file)!.imports.add(importPath);
        if (graph.get(info.file)!.imported.has(importPath)) {
          graph
            .get(info.file)!
            .imported.get(importPath)!
            .add([info.imported as string, info.local as string]);
        } else if (info.imported || info.local) {
          graph
            .get(info.file)!
            .imported.set(
              importPath,
              new Set([[info.imported as string, info.local as string]])
            );
        }

        if (!isMightBeModule) {
          ensureGraphNode(graph, importPath, createImportNode);
        } else {
          ensureGraphNode(graph, importPath, createModuleNode);
        }

        graph.get(importPath)!.importedBy.add(info.file);
      }
    },
    chalk
  );
}

/**
 * Processes exports and adds them to the graph
 */
export async function processExports(
  exports: ExportInfo[],
  graph: Graph,
  resolver: ImportResolver,
  chalk: ChalkInstance | unknown
): Promise<void> {
  if (exports.length === 0) {
    return;
  }

  await timed(
    "Packing exports",
    async () => {
      for (const exportInfo of exports) {
        let exportPath: string | null = null;
        let isMightBeModule: boolean | null = null;

        if (exportInfo.source) {
          const pathInfo = await resolver(exportInfo.file, exportInfo.source);
          exportPath = pathInfo.importPath;
          isMightBeModule = pathInfo.isMightBeModule;
        }

        if (!isMightBeModule && isMightBeModule !== null) {
          graph.get(exportInfo.file)!.reExported.add(exportPath!);
          ensureGraphNode(graph, exportPath!, createReExportNode);
          graph.get(exportPath!)!.reExportedBy.add(exportInfo.file);
        } else {
          if (isMightBeModule) {
            graph.get(exportInfo.file)!.reExported.add(exportPath!);
            ensureGraphNode(graph, exportPath!, createModuleNode);
            graph.get(exportPath!)!.reExportedBy.add(exportInfo.file);
          } else {
            exportInfo.names.forEach((name) => {
              graph.get(exportInfo.file)!.exports.add(name);
            });
          }
        }
      }
    },
    chalk
  );
}
