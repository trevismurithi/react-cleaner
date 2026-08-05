import { Project, SyntaxKind } from "ts-morph";
import type {
  CallExpression,
  ExportSpecifier,
  ExpressionStatement,
  Node,
  SourceFile,
} from "ts-morph";
import fs from "fs";
import path from "path";
import {
  getFileHash,
  getFixPassHashes,
  updateFixPassEntry,
} from "./cache";
import { logStage } from "./utils";
import { matchesHighRiskConsoleArgText } from "./consoleLogHighRiskPatterns";
import { matchesMediumRiskConsoleArgText } from "./consoleLogMediumRiskPatterns";
import type { ChalkInstance, FixPassKey } from "../types";

/** Keys under `parentGraph.fixes` — must match `FIX_PASS_KEYS` in cache.js */
const FIX_PASS: Record<FixPassKey, FixPassKey> = {
  pruneInternal: "pruneInternal",
  nukeConsoleLogs: "nukeConsoleLogs",
  deduplicateLogic: "deduplicateLogic",
};

interface EditStats {
  totalItemsRemoved: number;
  totalLinesRemoved: number;
  bytesSaved: number;
  filesModified: number;
}

interface ItemsRemovedStats {
  totalItemsRemoved: number;
}

interface SavingsReport {
  title: string;
  totalItemsRemoved: number;
  totalLinesRemoved: number;
  bytesSaved: number;
  filesModified: number;
  estimatedDeveloperHoursSaved: number;
  message: string;
}

type ConsoleLogRiskTier = "high" | "medium" | "low";
type PruneCandidateKind = "variable" | "function" | "class" | "symbol";

interface PruneFoundItem {
  file: string;
  line: number;
  name: string;
  kind: string;
}

interface ConsoleLogFoundItem {
  file: string;
  line: number;
  preview: string;
}

interface ConsoleLogDryRunResult {
  total: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
  foundByRisk: {
    high: ConsoleLogFoundItem[];
    medium: ConsoleLogFoundItem[];
    low: ConsoleLogFoundItem[];
  };
}

interface FoundListResult {
  total: number;
  found: PruneFoundItem[];
}

/**
 * Skip ts-morph when this pass already ran on the same file content (see `parentGraph.fixes`).
 * Dry-run never skips so counts stay accurate.
 */
function shouldSkipFixPass(
  resolvedPath: string,
  passHashes: Map<string, string>,
  isDryRun: boolean,
): boolean {
  if (isDryRun) {
    return false;
  }
  if (!passHashes.has(resolvedPath)) {
    return false;
  }
  let content: string;
  try {
    content = fs.readFileSync(resolvedPath, "utf8");
  } catch {
    return false;
  }
  return getFileHash(content) === passHashes.get(resolvedPath);
}

/** MD5 hex written to cache, or null */
function recordFixPassFingerprint(
  cwd: string,
  passKey: FixPassKey,
  resolvedPath: string,
): string | null {
  try {
    const content = fs.readFileSync(resolvedPath, "utf8");
    const hash = getFileHash(content);
    updateFixPassEntry(cwd, passKey, resolvedPath, hash);
    return hash;
  } catch {
    return null;
  }
}

/** `console.<name>(...)` calls treated as dev-only output (includes log, dir, table, …). */
const CONSOLE_DEBUG_METHOD_NAMES = new Set([
  "log",
  "dir",
  "dirxml",
  "table",
  "debug",
  "info",
  "trace",
]);

/**
 * Method name if this is a removable `console.<method>` / `<ns>.console.<method>` call
 */
function getRemovableConsoleDebugMethod(call: CallExpression): string | null {
  const expr = call.getExpression();
  if (!expr.isKind(SyntaxKind.PropertyAccessExpression)) {
    return null;
  }
  const method = expr.getName();
  if (!CONSOLE_DEBUG_METHOD_NAMES.has(method)) {
    return null;
  }
  const receiver = expr.getExpression();
  if (
    receiver.isKind(SyntaxKind.Identifier) &&
    receiver.getText() === "console"
  ) {
    return method;
  }
  if (
    receiver.isKind(SyntaxKind.PropertyAccessExpression) &&
    receiver.getName() === "console" &&
    receiver.getExpression().isKind(SyntaxKind.Identifier)
  ) {
    return method;
  }
  return null;
}

function consoleLogDryRunRiskTier(call: CallExpression): ConsoleLogRiskTier {
  const argText = call
    .getArguments()
    .map((a) => a.getText())
    .join(" ");
  if (matchesHighRiskConsoleArgText(argText)) {
    return "high";
  }
  if (matchesMediumRiskConsoleArgText(argText)) {
    return "medium";
  }
  return "low";
}

/**
 * Counts references to a name node in the same source file, excluding the definition site.
 */
function countInFileNonDefinitionReferences(
  nameNode: Node,
  sourceFile: SourceFile,
): number {
  const filePath = sourceFile.getFilePath();
  let count = 0;
  try {
    // ts-morph: findReferences exists on named nodes; Node base type omits it
    for (const referenced of (nameNode as any).findReferences()) {
      for (const ref of referenced.getReferences()) {
        if (ref.getSourceFile().getFilePath() !== filePath) {
          continue;
        }
        if (ref.isDefinition()) {
          continue;
        }
        count++;
      }
    }
  } catch {
    // Incomplete program (missing module, or .vue not in project) — treat as "has refs".
    return 1;
  }
  return count;
}

/**
 * Module-scope functions and variables that are never read or called inside the same file.
 * Skips exported symbols (including `export { x }`). Skips binding patterns (destructuring).
 *
 * @param filePath - Absolute or cwd-relative path to a .ts/.tsx/.js file
 */
export function findUnusedFunctionsAndVariablesInFile(filePath: string): {
  unusedFunctions: string[];
  unusedVariables: string[];
} {
  const resolved = path.resolve(filePath);
  const project = new Project({
    compilerOptions: {
      allowJs: true,
    },
  });
  const sourceFile = project.addSourceFileAtPath(resolved);

  const unusedFunctions: string[] = [];
  for (const fn of sourceFile.getFunctions()) {
    if (fn.isExported()) {
      continue;
    }
    const nameNode = fn.getNameNode();
    if (!nameNode || nameNode.getKindName() !== "Identifier") {
      continue;
    }
    if (countInFileNonDefinitionReferences(nameNode, sourceFile) === 0) {
      unusedFunctions.push(fn.getName()!);
    }
  }

  const unusedVariables: string[] = [];
  for (const decl of sourceFile.getVariableDeclarations()) {
    if (decl.isExported()) {
      continue;
    }
    const nameNode = decl.getNameNode();
    if (nameNode.getKindName() !== "Identifier") {
      continue;
    }
    if (countInFileNonDefinitionReferences(nameNode, sourceFile) === 0) {
      unusedVariables.push(decl.getName());
    }
  }

  return { unusedFunctions, unusedVariables };
}

function exportSpecifierMatches(
  spec: ExportSpecifier,
  exportName: string,
): boolean {
  if (spec.getName() === exportName) {
    return true;
  }
  const alias = spec.getAliasNode();
  return alias != null && alias.getText() === exportName;
}

/**
 * Removes `exportName` from local `export { a, b }` clauses (not `export { x } from './m'`).
 */
function removeNamedExportSpecifier(
  sourceFile: SourceFile,
  exportName: string,
  stats: ItemsRemovedStats,
): void {
  for (const exportDecl of sourceFile.getExportDeclarations()) {
    if (exportDecl.getModuleSpecifier()) {
      continue;
    }
    if (!exportDecl.hasNamedExports()) {
      continue;
    }
    const specs = [...exportDecl.getNamedExports()];
    for (const spec of specs) {
      if (exportSpecifierMatches(spec, exportName)) {
        spec.remove();
        stats.totalItemsRemoved++;
      }
    }
    if (
      !exportDecl.hasNamedExports() ||
      exportDecl.getNamedExports().length === 0
    ) {
      exportDecl.remove();
    }
  }
}

/**
 * Removes a specific named entity from imports and exports.
 * If it's the last one, it nukes the whole line.
 */
function pruneNamedBinding(
  sourceFile: SourceFile,
  nameToRemove: string,
  stats: ItemsRemovedStats,
): void {
  // 1. Handle Imports: import { A, B } from './module'
  const importDeclarations = sourceFile.getImportDeclarations();

  importDeclarations.forEach((importDecl) => {
    const specifier = importDecl
      .getNamedImports()
      .find((s) => s.getName() === nameToRemove);

    if (specifier) {
      // If this is the only import specifier, remove the whole line
      if (importDecl.getNamedImports().length === 1) {
        importDecl.remove();
      } else {
        // Otherwise, just remove the one name (ts-morph handles commas!)
        specifier.remove();
      }
      stats.totalItemsRemoved++;
    }
  });

  // 2. Handle Re-exports: export { A, B } from './module'
  const exportDeclarations = sourceFile.getExportDeclarations();

  exportDeclarations.forEach((exportDecl) => {
    const specifier = exportDecl
      .getNamedExports()
      .find((s) => s.getName() === nameToRemove);

    if (specifier) {
      // If it's the only export in the block, remove the whole line
      if (exportDecl.getNamedExports().length === 1) {
        exportDecl.remove();
      } else {
        specifier.remove();
      }
      stats.totalItemsRemoved++;
    }
  });
}

/**
 * Removes all unused exports from the source file.
 * Does not use `parentGraph.fixes` skipping: targets are explicit removals; importers must still be updated.
 */
export async function editFile(
  listToRemove: Map<string, string[]>,
  fileAssociated: Map<string, Set<string>>,
  chalk: ChalkInstance,
  message = "Editing files",
): Promise<SavingsReport> {
  logStage(chalk, message);
  const project = new Project({
    compilerOptions: {
      allowJs: true,
    },
  });
  const stats: EditStats = {
    totalItemsRemoved: 0,
    totalLinesRemoved: 0,
    bytesSaved: 0,
    filesModified: 0,
  };
  for (const [filePath, exportNames] of listToRemove.entries()) {
    const sourceFile = project.addSourceFileAtPath(filePath);
    const initialLoc = sourceFile.getEndLineNumber();
    const initialSize = fs.statSync(filePath).size;

    exportNames.forEach((exportName) => {
      // look for variable declaration
      const variableDeclaration = sourceFile.getVariableDeclaration(exportName);
      if (variableDeclaration) {
        variableDeclaration.remove();
        stats.totalItemsRemoved++;
      }

      // look for function declaration
      const functionDeclaration = sourceFile.getFunction(exportName);
      if (functionDeclaration) {
        functionDeclaration.remove();
        stats.totalItemsRemoved++;
      }

      // look for class declaration
      const classDeclaration = sourceFile.getClass(exportName);
      if (classDeclaration) {
        classDeclaration.remove();
        stats.totalItemsRemoved++;
      }

      // look for interface declaration
      const interfaceDeclaration = sourceFile.getInterface(exportName);
      if (interfaceDeclaration) {
        interfaceDeclaration.remove();
        stats.totalItemsRemoved++;
      }

      // look for type alias
      const typeAliasDeclaration = sourceFile.getTypeAlias(exportName);
      if (typeAliasDeclaration) {
        typeAliasDeclaration.remove();
        stats.totalItemsRemoved++;
      }

      // look for enum declaration
      const enumDeclaration = sourceFile.getEnum(exportName);
      if (enumDeclaration) {
        enumDeclaration.remove();
        stats.totalItemsRemoved++;
      }

      // namespace or legacy `module` block (ModuleDeclaration)
      const moduleOrNamespaceDeclaration = sourceFile.getModule(exportName);
      if (moduleOrNamespaceDeclaration) {
        moduleOrNamespaceDeclaration.remove();
        stats.totalItemsRemoved++;
      }

      removeNamedExportSpecifier(sourceFile, exportName, stats);
    });

    await sourceFile.save();

    const fileAssociatedFiles = fileAssociated.get(filePath)!;
    fileAssociatedFiles.forEach((fileAssociatedFile) => {
      const fileAssociatedSourceFile =
        project.addSourceFileAtPath(fileAssociatedFile);
      exportNames.forEach((exportName) => {
        pruneNamedBinding(fileAssociatedSourceFile, exportName, stats);
      });
      fileAssociatedSourceFile.save();
    });

    // calculate delta for this file
    const finalLoc = sourceFile.getEndLineNumber();
    const finalSize = fs.statSync(filePath).size;
    const linesRemoved = initialLoc - finalLoc;
    const bytesSaved = initialSize - finalSize;
    stats.totalLinesRemoved += linesRemoved;
    stats.bytesSaved += bytesSaved;
    stats.filesModified++;
  }
  return generateSavingsReport(stats);
}

/**
 * Generates a savings report based on the stats.
 */
export function generateSavingsReport(stats: EditStats): SavingsReport {
  // 0.25 (15 mins) per file for audit, 0.01 (36s) per variable for "cognitive cleanup"
  const hoursSaved =
    stats.filesModified * 0.25 + stats.totalItemsRemoved * 0.01;
  return {
    title: "Qleaner Surgical Report",
    totalItemsRemoved: stats.totalItemsRemoved,
    totalLinesRemoved: stats.totalLinesRemoved,
    bytesSaved: stats.bytesSaved,
    filesModified: stats.filesModified,
    estimatedDeveloperHoursSaved: hoursSaved,
    message: `You just saved your team approximately ${hoursSaved.toFixed(1)} hours of future manual auditing.`,
  };
}

function getPruneCandidateName(node: Node): string {
  const maybeNamed = node as Node & { getName?: () => string | undefined };
  if (typeof maybeNamed.getName === "function") {
    const name = maybeNamed.getName();
    if (name) {
      return name;
    }
  }
  return "(anonymous)";
}

function getPruneCandidateKind(node: Node): PruneCandidateKind {
  const kind = node.getKind();
  if (kind === SyntaxKind.VariableDeclaration) {
    return "variable";
  }
  if (kind === SyntaxKind.FunctionDeclaration) {
    return "function";
  }
  if (kind === SyntaxKind.ClassDeclaration) {
    return "class";
  }
  return "symbol";
}

export async function pruneInternal(
  files: string[],
  isDryRun = false,
  chalk: ChalkInstance,
  message = "Removing unused code",
): Promise<(SavingsReport & { found: PruneFoundItem[] }) | FoundListResult> {
  logStage(chalk, message);
  const cwd = process.cwd();
  const passHashes = getFixPassHashes(cwd, FIX_PASS.pruneInternal);
  const found: PruneFoundItem[] = [];
  const project = new Project({
    compilerOptions: {
      allowJs: true,
    },
  });
  const stats: EditStats = {
    totalItemsRemoved: 0,
    totalLinesRemoved: 0,
    bytesSaved: 0,
    filesModified: 0,
  };

  for (const filePath of files) {
    const resolved = path.resolve(filePath);
    if (shouldSkipFixPass(resolved, passHashes, isDryRun)) {
      continue;
    }

    const sourceFile = project.addSourceFileAtPath(resolved);
    const initialLoc = sourceFile.getEndLineNumber();
    const initialSize = fs.statSync(filePath).size;
    const isAffected = pruneInternalUnused(
      sourceFile,
      filePath,
      stats,
      isDryRun,
      found,
    );
    if (isAffected && !isDryRun) {
      await sourceFile.save();
      const finalLoc = sourceFile.getEndLineNumber();
      const finalSize = fs.statSync(filePath).size;
      const linesRemoved = initialLoc - finalLoc;
      const bytesSaved = initialSize - finalSize;
      stats.totalLinesRemoved += linesRemoved;
      stats.bytesSaved += bytesSaved;
      stats.filesModified++;
    }
    if (!isDryRun) {
      const hash = recordFixPassFingerprint(cwd, FIX_PASS.pruneInternal, resolved);
      if (hash != null) {
        passHashes.set(resolved, hash);
      }
    }
  }
  if (!isDryRun) {
    return {
      ...generateSavingsReport(stats),
      found,
    };
  }
  return {
    total: stats.totalItemsRemoved,
    found,
  };
}

/**
 * @returns True if the file had at least one unused symbol
 */
function pruneInternalUnused(
  sourceFile: SourceFile,
  filePath: string,
  stats: EditStats,
  isDryRun: boolean,
  found: PruneFoundItem[],
): boolean {
  let isAffected = false;
  // Check Variables, Functions, and Classes
  const candidates = [
    ...sourceFile.getVariableDeclarations(),
    ...sourceFile.getFunctions(),
    ...sourceFile.getClasses(),
  ];

  candidates.forEach((node) => {
    // 1. Skip if it's exported (let the global scanner handle exports)
    const maybeExported = node as typeof node & {
      isExported?: () => boolean;
    };
    if (maybeExported.isExported && maybeExported.isExported()) return;

    // 2. Check for references
    let references: Node[];
    try {
      references = node.findReferencesAsNodes();
    } catch {
      // Incomplete program (e.g. import of a deleted .vue) — do not remove this symbol.
      return;
    }

    // If references == 0, it's dead.
    // Note: In TS-Morph, the declaration itself is sometimes counted as a reference,
    // so we check if references are only within the declaration's own range.
    if (references.length === 0) {
      isAffected = true;
      found.push({
        file: filePath,
        line: node.getStartLineNumber(),
        name: getPruneCandidateName(node),
        kind: getPruneCandidateKind(node),
      });
      if (!isDryRun) {
        (node as any).remove();
      }
      stats.totalItemsRemoved++;
    }
  });
  return isAffected;
}

/**
 * Removes common `console` debug calls (log, dir, table, …) from files in the graph.
 * Dry run returns `{ total, highRisk, mediumRisk, lowRisk, foundByRisk }` where `foundByRisk` is
 * `{ high, medium, low }` arrays of `{ file, line, preview }` (for listing in dry-run output).
 */
export async function nukeConsoleLogs(
  files: string[],
  isDryRun = false,
  chalk: ChalkInstance,
  message = "Removing console logs",
): Promise<SavingsReport | ConsoleLogDryRunResult> {
  logStage(chalk, message);
  const cwd = process.cwd();
  const passHashes = getFixPassHashes(cwd, FIX_PASS.nukeConsoleLogs);
  let logsFound = 0;
  let highRiskLogs = 0;
  let mediumRiskLogs = 0;
  let lowRiskLogs = 0;
  const foundByRisk: ConsoleLogDryRunResult["foundByRisk"] = {
    high: [],
    medium: [],
    low: [],
  };
  const project = new Project({
    compilerOptions: {
      allowJs: true,
    },
  });
  const stats: EditStats = {
    totalItemsRemoved: 0,
    totalLinesRemoved: 0,
    bytesSaved: 0,
    filesModified: 0,
  };
  for (const filePath of files) {
    const resolved = path.resolve(filePath);
    if (shouldSkipFixPass(resolved, passHashes, isDryRun)) {
      continue;
    }

    let logsRemoved = 0;
    const sourceFile = project.addSourceFileAtPath(filePath);
    const initialLoc = sourceFile.getEndLineNumber();
    const initialSize = fs.statSync(filePath).size;

    // Important: collect nodes first, then mutate. Removing nodes can "forget" other nodes
    // captured earlier, which makes later reads throw InvalidOperationError.
    const removableStatements: ExpressionStatement[] = [];
    const removableCalls: CallExpression[] = [];
    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      let isRemovable = false;
      try {
        isRemovable = Boolean(getRemovableConsoleDebugMethod(call));
      } catch {
        // If the node is already forgotten for any reason, skip it safely.
        continue;
      }
      if (!isRemovable) continue;

      const exprStmt = call.getParentIfKind(SyntaxKind.ExpressionStatement);
      if (exprStmt) {
        removableStatements.push(exprStmt);
        removableCalls.push(call);
      }
    }

    if (removableStatements.length > 0) {
      logsRemoved = removableStatements.length;
      logsFound += removableStatements.length;
      for (const call of removableCalls) {
        switch (consoleLogDryRunRiskTier(call)) {
          case "high":
            highRiskLogs++;
            foundByRisk.high.push({
              file: filePath,
              line: call.getStartLineNumber(),
              preview: call.getText(),
            });
            break;
          case "medium":
            mediumRiskLogs++;
            foundByRisk.medium.push({
              file: filePath,
              line: call.getStartLineNumber(),
              preview: call.getText(),
            });
            break;
          default:
            lowRiskLogs++;
            foundByRisk.low.push({
              file: filePath,
              line: call.getStartLineNumber(),
              preview: call.getText(),
            });
        }
      }

      if (!isDryRun) {
        // Remove bottom-to-top so edits don't disturb earlier node positions.
        const uniqueByStart = new Map<number, ExpressionStatement>();
        for (const stmt of removableStatements) {
          uniqueByStart.set(stmt.getStart(), stmt);
        }
        const toRemove = [...uniqueByStart.values()].sort(
          (a, b) => b.getStart() - a.getStart(),
        );

        for (const stmt of toRemove) {
          stmt.remove();
        }

        await sourceFile.save();
        const finalLoc = sourceFile.getEndLineNumber();
        const finalSize = fs.statSync(filePath).size;
        const linesRemoved = initialLoc - finalLoc;
        const bytesSaved = initialSize - finalSize;
        stats.totalItemsRemoved += logsRemoved;
        stats.totalLinesRemoved += linesRemoved;
        stats.bytesSaved += bytesSaved;
        stats.filesModified++;
      }
    }
    if (!isDryRun) {
      const hash = recordFixPassFingerprint(cwd, FIX_PASS.nukeConsoleLogs, resolved);
      if (hash != null) {
        passHashes.set(resolved, hash);
      }
    }
  }
  if (!isDryRun) {
    return generateSavingsReport(stats);
  }
  return {
    total: logsFound,
    highRisk: highRiskLogs,
    mediumRisk: mediumRiskLogs,
    lowRisk: lowRiskLogs,
    foundByRisk,
  };
}

/**
 * Removes duplicate logic from the source file.
 */
export async function deduplicateLogic(
  files: string[],
  isDryRun = false,
  chalk: ChalkInstance,
  message = "Removing duplicates",
): Promise<(SavingsReport & { found: PruneFoundItem[] }) | FoundListResult> {
  logStage(chalk, message);
  const cwd = process.cwd();
  const passHashes = getFixPassHashes(cwd, FIX_PASS.deduplicateLogic);
  const found: PruneFoundItem[] = [];
  const project = new Project({
    compilerOptions: {
      allowJs: true,
    },
  });
  const stats: EditStats = {
    totalItemsRemoved: 0,
    totalLinesRemoved: 0,
    bytesSaved: 0,
    filesModified: 0,
  };
  for (const filePath of files) {
    const resolved = path.resolve(filePath);
    if (shouldSkipFixPass(resolved, passHashes, isDryRun)) {
      continue;
    }

    let duplicatesRemoved = 0;
    const seenCode = new Set<string>();
    const sourceFile = project.addSourceFileAtPath(filePath);
    const initialLoc = sourceFile.getEndLineNumber();
    const initialSize = fs.statSync(filePath).size;

    // We check functions and classes specifically
    const logicBlocks = [
      ...sourceFile.getFunctions(),
      ...sourceFile.getClasses(),
    ];

    logicBlocks.forEach((node) => {
      const codeBody = node.getText(); // The actual source code of the function/class

      if (seenCode.has(codeBody)) {
        found.push({
          file: filePath,
          line: node.getStartLineNumber(),
          name: getPruneCandidateName(node),
          kind: getPruneCandidateKind(node),
        });
        if (!isDryRun) {
          node.remove();
        }
        duplicatesRemoved++;
      } else {
        seenCode.add(codeBody);
      }
    });
    if (isDryRun && duplicatesRemoved > 0) {
      stats.totalItemsRemoved += duplicatesRemoved;
    }
    if (!isDryRun && duplicatesRemoved > 0) {
      await sourceFile.save();
      const finalLoc = sourceFile.getEndLineNumber();
      const finalSize = fs.statSync(filePath).size;
      const linesRemoved = initialLoc - finalLoc;
      const bytesSaved = initialSize - finalSize;
      stats.totalItemsRemoved += duplicatesRemoved;
      stats.totalLinesRemoved += linesRemoved;
      stats.bytesSaved += bytesSaved;
      stats.filesModified++;
    }
    if (!isDryRun) {
      const hash = recordFixPassFingerprint(
        cwd,
        FIX_PASS.deduplicateLogic,
        resolved,
      );
      if (hash != null) {
        passHashes.set(resolved, hash);
      }
    }
  }
  if (!isDryRun) {
    return {
      ...generateSavingsReport(stats),
      found,
    };
  }
  return {
    total: found.length,
    found,
  };
}
