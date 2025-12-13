const fg = require("fast-glob");
const fs = require("fs");
const Table = require("cli-table3");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const path = require("path");
const { createResolver } = require("./utils/resolver");
const {
  loadCache,
  getFileHash,
  needsRebuild,
  saveCache,
  clearCache,
} = require("./utils/cache");
const { isExcludedFile, compareFiles } = require("./utils/utils");

async function getFiles(directory = "src", options, chalk) {
  const contentPaths = [`${directory}/**/*.{tsx,ts,js,jsx}`];
  if (options.excludeDir && options.excludeDir.length > 0) {
    options.excludeDir.forEach((dir) => {
      contentPaths.push(`!${dir}/**`);
    });
  }
  if (options.excludeFile && options.excludeFile.length > 0) {
    options.excludeFile.forEach((file) => {
      contentPaths.push(`!${directory}/**/${file}`);
    });
  }

  const files = await fg(contentPaths);
  const imports = [];

  let index = 0;
  for (const file of files) {
    index++;
    console.clear();
    console.log("Scanning file...", index, "of", files.length);
    const code = fs.readFileSync(file, "utf8");
    const ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
    traverse(ast, {
      ImportDeclaration: ({ node }) => {
        imports.push({
          from: node.source.value,
          file: file,
          line: node.loc.start.line,
          column: node.loc.start.column,
        });
      },
    });
    //   ExportNamedDeclaration: ({ node }) => {
    //     if (node.declaration.declarations && node.declaration.declarations[0].id && node.declaration.declarations[0].id.name) {
    //       exports.push(node.declaration.declarations[0].id.name);
    //     }
    //   },
    //   FunctionDeclaration: ({ node }) => {
    //     console.log('FunctionDeclaration', node.id);
    //     if (node.id && node.id.name) {
    //       exports.push(node.id.name);
    //     }
    //   },
    // });
  }

  if (options.table) {
    const tableImports = new Table({
      head: ["File", "Line", "Column", "Import"],
      colWidths: [20, 10, 10, 20],
    });

    const tableFiles = new Table({
      head: ["File"],
      colWidths: [20],
    });

    if (options.listFiles) {
      files.forEach((file) => {
        tableFiles.push([file]);
      });
    }
    if (options.listImports) {
      imports.forEach((importStatement) => {
        tableImports.push([
          importStatement.file,
          importStatement.line,
          importStatement.column,
          importStatement.from,
        ]);
      });
    }
    return { tableImports, tableFiles };
  } else {
    if (options.listFiles) {
      console.log(chalk.green("***************** Files *****************"));
      files.forEach((file) => {
        console.log(chalk.green(file));
      });
    }
    if (options.listImports) {
      console.log(chalk.yellow("***************** Imports *****************"));
      imports.forEach((importStatement) => {
        console.log(
          chalk.yellow(
            `${importStatement.file}:${importStatement.line}:${importStatement.column}  ${importStatement.from}`
          )
        );
      });
    }
    return { tableImports: imports, tableFiles: files };
  }
}

async function unUsedFiles(ora, chalk, directory = "src", options) {
  // Start spinner
  const spinner = ora("Start Qleaner scan...").start();

  const resolver = createResolver(directory);
  // check for clearCache option
  if (options.clearCache) {
    spinner.text = "🔍 Clearing cache...";
    clearCache(process.cwd());
    spinner.succeed("✓ Cache cleared successfully");
  }
  spinner.text = "🔍 Loading cache...";
  const cache = loadCache(process.cwd());
  spinner.succeed("✓ Cache loaded successfully");
  const contentPaths = [`${directory}/**/*.{tsx,ts,js,jsx}`];
  if (options.excludeDir && options.excludeDir.length > 0) {
    options.excludeDir.forEach((dir) => {
      contentPaths.push(`!${dir}/**`);
    });
  }
  if (options.excludeFile && options.excludeFile.length > 0) {
    options.excludeFile.forEach((file) => {
      contentPaths.push(`!${directory}/**/${file}`);
    });
  }

  const LOG_PREFIX = "Qleaner scan";
  console.time(LOG_PREFIX);
  // STEP 1
  spinner.text = "🔍 Discovering files...";
  const files = await fg(contentPaths);
  spinner.succeed(`Found ${files.length} files`);

  let imports = [];
  let unusedFiles = new Set();

  // STEP 2
  spinner.text = "🔍 Checking files...";
  let index = 0;
  for (const file of files) {
    index++;
    // console.clear();
    // console.log("Checking file...", index, "of", files.length);
    const code = fs.readFileSync(file, "utf8");
    if (needsRebuild(file, code, cache)) {
      const ast = parser.parse(code, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      });
      cache[file] = {
        hash: getFileHash(code),
        imports: [],
        isImported: false,
        isChecked: false,
        lastModified: fs.statSync(file).mtime.getTime(),
      };
      traverse(ast, {
        ImportDeclaration: ({ node }) => {
          imports.push({
            from: node.source.value,
            file: file,
            line: node.loc.start.line,
            column: node.loc.start.column,
          });
          cache[file].imports.push({
            from: node.source.value,
            file: file,
            line: node.loc.start.line,
            column: node.loc.start.column,
            lastModified: fs.statSync(path.resolve(file)).mtime.getTime(),
          });
        },
      });
    } else {
      // debugCount++;
      // console.log('cache hit', debugCount);
    }
  }
  spinner.succeed(`Checked ${files.length} files`);

  // imports being empty shows all the files were cached
  if (imports.length === 0) {
    imports = cache[directory] ? cache[directory].imports : [];
  }

  // STEP 3
  spinner.text = "🔍 Checking imports...";
  // debugCount = 0;
  index = 0;
  unusedFiles =
    cache[directory] &&
    cache[directory].unusedFiles &&
    cache[directory].unusedFiles.length > 0
      ? new Set(cache[directory].unusedFiles)
      : new Set();

  for (const file of files) {
    index++;
    // console.clear();
    // console.log("Checking file...", index, "of", files.length);
    const code = fs.readFileSync(file, "utf8");
    if (needsRebuild(file, code, cache) || !cache[file].isChecked) {
      cache[file].isChecked = true;
      let i = 0;
      let isFound = false;
      while (!isFound && i < imports.length) {
        const importFilePath = await resolver(imports[i].file, imports[i].from);
        if (compareFiles(path.resolve(file), importFilePath)) {
          isFound = true;
          cache[file].isImported = true;
          break;
        } else if (i === imports.length - 1) {
          if (options.excludeFilePrint && options.excludeFilePrint.length > 0) {
            if (!isExcludedFile(file, options.excludeFilePrint)) {
              unusedFiles.add(file);
            }
          } else {
            unusedFiles.add(file);
          }
          break;
        }
        i++;
      }
    } else {
      // if file is not in unused files set and not imported, add it to unused files set
      // if excludeFilePrint is provided, check if file is excluded
      // if excludeFilePrint is not provided, add file to unused files set
      if (!unusedFiles.has(file) && !cache[file].isImported) {
        if (options.excludeFilePrint && options.excludeFilePrint.length > 0) {
          if (!isExcludedFile(file, options.excludeFilePrint)) {
            unusedFiles.add(file);
          }
        } else {
          unusedFiles.add(file);
        }
      }
      // if file is in unused files set and excludeFilePrint is provided, delete it if it is excluded
      else if (
        unusedFiles.has(file) &&
        options.excludeFilePrint &&
        options.excludeFilePrint.length > 0
      ) {
        if (isExcludedFile(file, options.excludeFilePrint)) {
          unusedFiles.delete(file);
        }
      }
    }
  }

  cache[directory] = {
    imports: imports,
  };
  spinner.succeed(`Found ${unusedFiles.size} unused files`);
  console.timeEnd(LOG_PREFIX);
  const unusedFilesArray = Array.from(unusedFiles);
  cache[directory].unusedFiles = unusedFilesArray;
  saveCache(process.cwd(), cache);
  return unusedFilesArray;
}

module.exports = {
  getFiles,
  unUsedFiles,
};
