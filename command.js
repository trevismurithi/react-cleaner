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
    console.log('Scanning file...', index, 'of', files.length);
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

async function unUsedFiles(chalk, directory = "src", options) {
  const resolver = createResolver(directory);
  const cache = loadCache(process.cwd());
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
  let imports = [];
  const unusedFiles = [];

  // debug log
  // let debugCount = 0;
  let index = 0;
  for (const file of files) {
    index++;
    console.clear();
    console.log('Checking file...', index, 'of', files.length);
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

  // imports beings empty shows all the files were cached
  if(imports.length === 0) {
    imports = cache[directory]? cache[directory].imports: [];
  }


  // debugCount = 0;
  index = 0;
  for (const file of files) {
    index++;
    console.clear();
    console.log('Checking file...', index, 'of', files.length);
    const code = fs.readFileSync(file, "utf8");
    if (!cache[file].isImported || needsRebuild(file, code, cache)) {
      let i = 0;
      let isFound = false;
      while (!isFound && i < imports.length) {
        const importFilePath = await resolver(
          imports[i].file,
          imports[i].from
        );
        if (compareFiles(path.resolve(file), importFilePath)) {
          isFound = true;
          cache[file].isImported = true;
          break;
        } else if (i === imports.length - 1) {
          if (options.excludeFilePrint && options.excludeFilePrint.length > 0) {
            if (!isExcludedFile(file, options.excludeFilePrint)) {
              unusedFiles.push(file);
            }
          } else {
            unusedFiles.push(file);
          }
          break;
        }
        i++;
      }
    } else {
      // debugCount++;
      // console.log("debug hit", debugCount);
    }
  }
  
  cache[directory] =  {
    imports: imports,
  }
  saveCache(process.cwd(), cache);
  return unusedFiles;
}



module.exports = {
  getFiles,
  unUsedFiles,
};
