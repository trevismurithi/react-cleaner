const prompts = require("prompts");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);
const crypto = require("crypto");

async function askDeleteFiles(unusedFiles, isCode = true) {
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
function removeEmptyTrashSubdir(trashDir, destinationPath) {
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

async function moveToTrash(files, _,isCode = true) {
  const trashDir = path.join(process.cwd(), ".trash");
  const cache = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "unused-check-cache.json"), "utf8")
  );
  if (!fs.existsSync(trashDir)) {
    fs.mkdirSync(trashDir);
  }
  const stats = {
    filesDeleted: 0,
    bytesSaved: 0,
    exportsStripped: 0,
    estimatedDeveloperHoursSaved: 0,
  }
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
      const codeNode = cache.parentGraph.graph[file.file];
      const exportsField = codeNode?.exports;
      if (Array.isArray(exportsField)) {
        stats.exportsStripped += exportsField.length;
      } else if (exportsField && typeof exportsField.size === "number") {
        stats.exportsStripped += exportsField.size;
      }
    } else {
      const imageNode = cache.imageParentGraph.imageGraph[file.file];
      const exportsField = imageNode?.exports;
      if (Array.isArray(exportsField)) {
        stats.exportsStripped += exportsField.length;
      } else if (exportsField && typeof exportsField.size === "number") {
        stats.exportsStripped += exportsField.size;
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

async function moveFromTrash(isCode = true) {
  const trashDir = path.join(process.cwd(), ".trash");
  const cacheFile = path.join(process.cwd(), "unused-check-cache.json");
  if (!fs.existsSync(cacheFile)) {
    console.error(`Cache file does not exist, skipping...`);
    return;
  }
  const cache = JSON.parse(
    fs.readFileSync(cacheFile, "utf8")
  );
  if (!fs.existsSync(trashDir)) {
    console.error(`Trash directory does not exist, skipping...`);
    return;
  }

  let files = [];
  if (isCode) {
    files = Array.from(cache.parentGraph.unusedFiles);
  } else {
    files = Array.from(cache.imageParentGraph.unusedImages);
  }
  for (const file of files) {
    if (!file.destination) {
      continue;
    }
    if (!fs.existsSync(file.destination)) {
      console.error(
        `Trash file missing, skipping restore: ${file.destination}`,
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
    sessionID: files[0].sessionID, // all files have the same sessionID
  });
  if (isCode) {
    cache.parentGraph.unusedFiles = Array.from(cache.parentGraph.unusedFiles);
  } else {
    cache.imageParentGraph.unusedImages = Array.from(cache.imageParentGraph.unusedImages);
  }
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
}

async function updateStatistics (action, {sessionID, filesDeleted, bytesSaved, exportsStripped}){
  const filePath = path.join(process.cwd(), "qleaner.stats.json");
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({
      statistics: {
      }
    }, null, 2));
  }
  const config = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (action === "remove") {
    delete config.statistics[sessionID];
  }else if (action === "add") {
    config.statistics[sessionID] = {
      filesDeleted,
      bytesSaved,
      exportsStripped,
      estimatedDeveloperHoursSaved: filesDeleted * 0.25, // (filesDeleted * 0.25)
    };
  }
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
}

async function updateFileAssociatedStats(sessionID, fileAssociated) {
  const filePath = path.join(process.cwd(), "qleaner.stats.json");
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}, null, 2));
  }
  const config = JSON.parse(fs.readFileSync(filePath, "utf8"));
  config.fileAssociatedStats = {
    ...config.fileAssociatedStats,
    [sessionID]: fileAssociated,
  };
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
}

async function deleteFiles(files, unusedFiles, isCode = true) {
  const cache = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "unused-check-cache.json"), "utf8")
  );
  const stats = {
    filesDeleted: 0,
    bytesSaved: 0,
    exportsStripped: 0,
    estimatedDeveloperHoursSaved: 0,
  }

  for (const file of files) {
    try {
      fs.unlinkSync(file.file);
      unusedFiles.delete(file);
      stats.filesDeleted += 1;
      stats.bytesSaved += file.size;
      if (isCode) {
        stats.exportsStripped += cache.parentGraph.get(file.file).exports.size;
      } else {
        stats.exportsStripped += cache.imageParentGraph.get(file.file).exports.size;
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

function isExcludedFile(file, excludeFiles) {
  return excludeFiles.some((exclude) => file.includes(exclude));
}

function compareFiles(filePath, importPath) {
  return filePath === importPath;
}

function chalkOrPlain(chalk) {
  if (chalk && typeof chalk.cyan === "function") {
    return chalk;
  }
  const id = (s) => s;
  return { cyan: id, green: id, yellow: id, red: id, dim: id, bold: id, blue: id, magenta: id };
}

/**
 * Stage logger used in place of progress bars.
 * Same API as the old cli-progress bar (increment/stop) so call sites stay unchanged.
 */
function createStepBar(step, total, label, chalk) {
  const c = chalkOrPlain(chalk);
  const start = Date.now();
  const countLabel = total != null ? c.dim(` (${total})`) : "";
  console.log(`${c.cyan("→")} ${c.bold(label)}${countLabel}`);
  return {
    increment() {},
    update() {},
    stop(detail) {
      const ms = Date.now() - start;
      const extra = detail ? ` — ${detail}` : "";
      console.log(
        `${c.green("✓")} ${label}${extra} ${c.dim(`(${formatMs(ms)})`)}`
      );
    },
  };
}

function formatMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** @deprecated Delays removed — kept as no-op for any leftover callers. */
function stepDelay() {
  return Promise.resolve();
}

function logStage(chalk, message, status = "start") {
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

async function timed(label, fn, chalk) {
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
async function runTimedCommand(chalk, commandName, fn) {
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

function loadTSConfig(projectRoot, configName = "tsconfig.json") {
    const configPath =
      ts.findConfigFile(projectRoot, ts.sys.fileExists, configName)
  
    if (!configPath) return null
  
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  
    if (configFile.error) {
      throw new Error(ts.formatDiagnosticsWithColorAndContext(
        [configFile.error],
        {
          getCanonicalFileName: f => f,
          getCurrentDirectory: ts.sys.getCurrentDirectory,
          getNewLine: () => "\n"
        }
      ))
    }
  
    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath)
    )
  
    return {
      baseUrl: parsed.options.baseUrl ?? ".",
      paths: parsed.options.paths ?? {},
      configPath
    }
  
}

async function uninstallDependency(dependency) {
  // read qleaner.config.json
  const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "qleaner.config.json"), "utf8"));
  let command = "";

  if(config.packageManager === "npm"){
    command = `npm uninstall ${dependency}`;
  }else if(config.packageManager === "yarn"){
    command = `yarn remove ${dependency}`;
  }else if(config.packageManager === "pnpm"){
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
    throw new Error(`Failed to uninstall "${dependency}" using ${config.packageManager}: ${error.message}`);
  }
}

function combineValues(listMap) {
  const combined = new Map();
  for(const [key, value] of listMap.entries()) {
    if(combined.has(value)) {
      combined.get(value).push(key);
    } else {
      combined.set(value, [key]);
    }
  }
  return combined;
}
module.exports = {
  askDeleteFiles,
  isExcludedFile,
  compareFiles,
  createStepBar,
  stepDelay,
  timed,
  runTimedCommand,
  logStage,
  formatMs,
  loadTSConfig,
  moveFromTrash,
  uninstallDependency,
  combineValues,
  updateFileAssociatedStats,
  moveToTrash,
};
