import prompts from "prompts";
import fs from "fs";
import path from "path";
import ts from "typescript";
import { exec } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import type { CacheFile, ChalkInstance, PackageManager, UnusedFileEntry } from "../types";

const execAsync = promisify(exec);

export interface TrashableFile extends UnusedFileEntry {
  destination?: string | null;
  sessionID?: string;
  hash?: string | null;
}

export interface PlainChalk {
  cyan: (s: string) => string;
  green: (s: string) => string;
  yellow: (s: string) => string;
  red: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
  blue: (s: string) => string;
  magenta: (s: string) => string;
}

export interface TsConfigPaths {
  baseUrl: string;
  paths: Record<string, string[]>;
  configPath: string;
}

interface StatsPayload {
  sessionID: string;
  filesDeleted?: number;
  bytesSaved?: number;
  exportsStripped?: number;
}

interface QleanerStatsFile {
  statistics?: Record<
    string,
    {
      filesDeleted: number;
      bytesSaved: number;
      exportsStripped: number;
      estimatedDeveloperHoursSaved: number;
    }
  >;
  fileAssociatedStats?: Record<string, unknown>;
  [key: string]: unknown;
}

interface QleanerConfigFile {
  packageManager: PackageManager;
  [key: string]: unknown;
}

export async function askDeleteFiles(
  unusedFiles: Set<TrashableFile>,
  isCode = true
): Promise<void> {
  const response = await prompts({
    type: "multiselect",
    name: "toDelete",
    message: "Select unused files to delete or move to .trash directory",
    choices: Array.from(unusedFiles).map((file) => ({
      title: file.file,
      value: file,
    })),
  });
  if (response && response.toDelete && response.toDelete.length > 0) {
    const method = await prompts({
      type: "select",
      name: "method",
      message: "Select a method to delete the files",
      choices: [
        { title: "Move to .trash directory", value: "moveToTrash" },
        { title: "Delete files", value: "deleteFiles" },
      ],
    });
    if (method.method === "moveToTrash") {
      return await moveToTrash(response.toDelete, unusedFiles, isCode);
    } else if (method.method === "deleteFiles") {
      return await deleteFiles(response.toDelete, unusedFiles, isCode);
    }
  }
}

/** Remove `.trash/<uuid>/` after restore when the subfolder is empty (legacy flat paths skip `.trash` itself). */
function removeEmptyTrashSubdir(
  trashDir: string,
  destinationPath: string
): void {
  const trashResolved = path.resolve(trashDir);
  const parentDir = path.resolve(path.dirname(destinationPath));
  if (parentDir === trashResolved) {
    return;
  }
  if (!parentDir.startsWith(`${trashResolved}${path.sep}`)) {
    return;
  }
  try {
    if (!fs.existsSync(parentDir)) {
      return;
    }
    if (fs.readdirSync(parentDir).length > 0) {
      return;
    }
    fs.rmdirSync(parentDir);
  } catch {
    // Best-effort cleanup only.
  }
}

export async function moveToTrash(
  files: TrashableFile[],
  _: Set<TrashableFile> | unknown,
  isCode = true
): Promise<void> {
  const trashDir = path.join(process.cwd(), ".trash");
  const cache = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "unused-check-cache.json"), "utf8")
  ) as CacheFile;
  if (!fs.existsSync(trashDir)) {
    fs.mkdirSync(trashDir);
  }
  const stats = {
    filesDeleted: 0,
    bytesSaved: 0,
    exportsStripped: 0,
    estimatedDeveloperHoursSaved: 0,
  };
  const sessionID = new Date().toISOString();
  for (const file of files) {
    if (!fs.existsSync(file.file)) {
      console.error(`File ${file.file} does not exist, skipping...`);
      continue;
    }
    const fileName = path.basename(file.file);
    const trashSubdir = path.join(trashDir, crypto.randomUUID());
    fs.mkdirSync(trashSubdir, { recursive: true });
    const destination = path.join(trashSubdir, fileName);
    fs.renameSync(file.file, destination);
    file.destination = destination;
    stats.filesDeleted += 1;
    file.sessionID = sessionID;
    stats.bytesSaved += file.size;
    if (isCode) {
      const codeNode = (
        cache.parentGraph.graph as Record<string, { exports?: unknown }>
      )[file.file];
      const exportsField = codeNode?.exports;
      if (Array.isArray(exportsField)) {
        stats.exportsStripped += exportsField.length;
      } else if (
        exportsField &&
        typeof (exportsField as { size?: number }).size === "number"
      ) {
        stats.exportsStripped += (exportsField as { size: number }).size;
      }
    } else {
      const imageNode = (
        cache.imageParentGraph.imageGraph as Record<
          string,
          { exports?: unknown }
        >
      )[file.file];
      const exportsField = imageNode?.exports;
      if (Array.isArray(exportsField)) {
        stats.exportsStripped += exportsField.length;
      } else if (
        exportsField &&
        typeof (exportsField as { size?: number }).size === "number"
      ) {
        stats.exportsStripped += (exportsField as { size: number }).size;
      }
    }
    stats.estimatedDeveloperHoursSaved += 0.25;
  }
  if (isCode) {
    cache.parentGraph.unusedFiles = Array.from(files);
    fs.writeFileSync(
      path.join(process.cwd(), "unused-check-cache.json"),
      JSON.stringify(cache, null, 2)
    );
  } else {
    cache.imageParentGraph.unusedImages = Array.from(files);
    fs.writeFileSync(
      path.join(process.cwd(), "unused-check-cache.json"),
      JSON.stringify(cache, null, 2)
    );
  }

  updateStatistics("add", {
    sessionID,
    filesDeleted: stats.filesDeleted,
    bytesSaved: stats.bytesSaved,
    exportsStripped: stats.exportsStripped,
  });
}

export async function moveFromTrash(isCode = true): Promise<void> {
  const trashDir = path.join(process.cwd(), ".trash");
  const cacheFile = path.join(process.cwd(), "unused-check-cache.json");
  if (!fs.existsSync(cacheFile)) {
    console.error(`Cache file does not exist, skipping...`);
    return;
  }
  const cache = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as CacheFile;
  if (!fs.existsSync(trashDir)) {
    console.error(`Trash directory does not exist, skipping...`);
    return;
  }

  let files: TrashableFile[] = [];
  if (isCode) {
    files = Array.from(cache.parentGraph.unusedFiles) as TrashableFile[];
  } else {
    files = Array.from(
      cache.imageParentGraph.unusedImages
    ) as TrashableFile[];
  }
  for (const file of files) {
    if (!file.destination) {
      continue;
    }
    if (!fs.existsSync(file.destination)) {
      console.error(
        `Trash file missing, skipping restore: ${file.destination}`
      );
      continue;
    }
    const restoreDir = path.dirname(file.file);
    if (!fs.existsSync(restoreDir)) {
      fs.mkdirSync(restoreDir, { recursive: true });
    }
    fs.renameSync(file.destination, file.file);
    removeEmptyTrashSubdir(trashDir, file.destination);
    file.destination = null;
  }
  updateStatistics("remove", {
    sessionID: files[0].sessionID!, // all files have the same sessionID
  });
  if (isCode) {
    cache.parentGraph.unusedFiles = Array.from(cache.parentGraph.unusedFiles);
  } else {
    cache.imageParentGraph.unusedImages = Array.from(
      cache.imageParentGraph.unusedImages
    );
  }
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
}

async function updateStatistics(
  action: "add" | "remove",
  { sessionID, filesDeleted, bytesSaved, exportsStripped }: StatsPayload
): Promise<void> {
  const filePath = path.join(process.cwd(), "qleaner.stats.json");
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          statistics: {},
        },
        null,
        2
      )
    );
  }
  const config = JSON.parse(
    fs.readFileSync(filePath, "utf8")
  ) as QleanerStatsFile;
  if (!config.statistics) {
    config.statistics = {};
  }
  if (action === "remove") {
    delete config.statistics[sessionID];
  } else if (action === "add") {
    config.statistics[sessionID] = {
      filesDeleted: filesDeleted!,
      bytesSaved: bytesSaved!,
      exportsStripped: exportsStripped!,
      estimatedDeveloperHoursSaved: filesDeleted! * 0.25, // (filesDeleted * 0.25)
    };
  }
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
}

export async function updateFileAssociatedStats(
  sessionID: string,
  fileAssociated: unknown
): Promise<void> {
  const filePath = path.join(process.cwd(), "qleaner.stats.json");
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}, null, 2));
  }
  const config = JSON.parse(
    fs.readFileSync(filePath, "utf8")
  ) as QleanerStatsFile;
  config.fileAssociatedStats = {
    ...config.fileAssociatedStats,
    [sessionID]: fileAssociated,
  };
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
}

async function deleteFiles(
  files: TrashableFile[],
  unusedFiles: Set<TrashableFile>,
  isCode = true
): Promise<void> {
  const cache = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "unused-check-cache.json"), "utf8")
  ) as any;
  const stats = {
    filesDeleted: 0,
    bytesSaved: 0,
    exportsStripped: 0,
    estimatedDeveloperHoursSaved: 0,
  };

  for (const file of files) {
    try {
      fs.unlinkSync(file.file);
      unusedFiles.delete(file);
      stats.filesDeleted += 1;
      stats.bytesSaved += file.size;
      if (isCode) {
        stats.exportsStripped += cache.parentGraph.get(file.file).exports.size;
      } else {
        stats.exportsStripped += cache.imageParentGraph.get(
          file.file
        ).exports.size;
      }
      stats.estimatedDeveloperHoursSaved += 0.25;
      // read the file and get the content
    } catch (error) {
      console.error(`Error deleting file ${file.file}: ${error}`);
    }
  }
  if (isCode) {
    cache.parentGraph.unusedFiles = Array.from(unusedFiles);
    fs.writeFileSync(
      path.join(process.cwd(), "unused-check-cache.json"),
      JSON.stringify(cache, null, 2)
    );
  } else {
    cache.imageParentGraph.unusedImages = Array.from(unusedFiles);
    fs.writeFileSync(
      path.join(process.cwd(), "unused-check-cache.json"),
      JSON.stringify(cache, null, 2)
    );
  }
  updateStatistics("add", {
    sessionID: new Date().toISOString(),
    filesDeleted: stats.filesDeleted,
    bytesSaved: stats.bytesSaved,
    exportsStripped: stats.exportsStripped,
  });
}

export function isExcludedFile(file: string, excludeFiles: string[]): boolean {
  return excludeFiles.some((exclude) => file.includes(exclude));
}

export function compareFiles(filePath: string, importPath: string): boolean {
  return filePath === importPath;
}

export function chalkOrPlain(
  chalk: ChalkInstance | PlainChalk | unknown
): PlainChalk {
  if (
    chalk &&
    typeof (chalk as PlainChalk).cyan === "function"
  ) {
    return chalk as PlainChalk;
  }
  const id = (s: string) => s;
  return {
    cyan: id,
    green: id,
    yellow: id,
    red: id,
    dim: id,
    bold: id,
    blue: id,
    magenta: id,
  };
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** @deprecated Delays removed — kept as no-op for any leftover callers. */
export function stepDelay(): Promise<void> {
  return Promise.resolve();
}

export function logStage(
  chalk: ChalkInstance | unknown,
  message: string,
  status: "start" | "done" | "fail" | "info" = "start"
): void {
  const c = chalkOrPlain(chalk);
  if (status === "done") {
    console.log(`${c.green("✓")} ${message}`);
  } else if (status === "fail") {
    console.log(`${c.red("✗")} ${message}`);
  } else if (status === "info") {
    console.log(`${c.blue("·")} ${message}`);
  } else {
    console.log(`${c.cyan("→")} ${c.bold(message)}`);
  }
}

export async function timed<T>(
  label: string,
  fn: () => Promise<T> | T,
  chalk: ChalkInstance | unknown
): Promise<T> {
  const c = chalkOrPlain(chalk);
  const start = Date.now();
  console.log(`${c.cyan("→")} ${c.bold(label)}`);
  try {
    return await fn();
  } finally {
    console.log(
      `${c.green("✓")} ${label} ${c.dim(`(${formatMs(Date.now() - start)})`)}`
    );
  }
}

/** Wraps a full CLI command and logs total elapsed time when it finishes. */
export async function runTimedCommand<T>(
  chalk: ChalkInstance | unknown,
  commandName: string,
  fn: () => Promise<T> | T
): Promise<T> {
  const c = chalkOrPlain(chalk);
  const start = Date.now();
  try {
    return await fn();
  } finally {
    console.log(
      `${c.green("✓")} ${c.bold(commandName)} ${c.dim(`completed in ${formatMs(Date.now() - start)}`)}`
    );
  }
}

export function loadTSConfig(
  projectRoot: string,
  configName = "tsconfig.json"
): TsConfigPaths | null {
  const configPath = ts.findConfigFile(
    projectRoot,
    ts.sys.fileExists,
    configName
  );

  if (!configPath) return null;

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

  if (configFile.error) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext([configFile.error], {
        getCanonicalFileName: (f) => f,
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getNewLine: () => "\n",
      })
    );
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath)
  );

  return {
    baseUrl: parsed.options.baseUrl ?? ".",
    paths: (parsed.options.paths as Record<string, string[]>) ?? {},
    configPath,
  };
}

export async function uninstallDependency(dependency: string): Promise<boolean> {
  // read qleaner.config.json
  const config = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "qleaner.config.json"), "utf8")
  ) as QleanerConfigFile;
  let command = "";

  if (config.packageManager === "npm") {
    command = `npm uninstall ${dependency}`;
  } else if (config.packageManager === "yarn") {
    command = `yarn remove ${dependency}`;
  } else if (config.packageManager === "pnpm") {
    command = `pnpm remove ${dependency}`;
  } else {
    throw new Error(`Unsupported package manager: ${config.packageManager}`);
  }

  try {
    const { stderr } = await execAsync(command);
    if (stderr && stderr.trim()) {
      console.error(stderr);
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to uninstall "${dependency}" using ${config.packageManager}: ${message}`
    );
  }
}

export function combineValues(
  listMap: Map<string, string>
): Map<string, string[]> {
  const combined = new Map<string, string[]>();
  for (const [key, value] of listMap.entries()) {
    if (combined.has(value)) {
      combined.get(value)!.push(key);
    } else {
      combined.set(value, [key]);
    }
  }
  return combined;
}
