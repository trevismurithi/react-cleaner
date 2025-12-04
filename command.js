const fg = require("fast-glob");
const fs = require("fs");
const Table = require('cli-table3');
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const path = require("path");
const { createResolver } = require("./utils/resolver");




async function getFiles(directory = "src", options, chalk) {
    const contentPaths = [`${directory}/**/*.{tsx,ts,js,jsx}`];
    if (options.excludeDir && options.excludeDir.length > 0) {
        options.excludeDir.forEach(dir => {
            contentPaths.push(`!${dir}/**`);
        });
    }
    if (options.excludeFile && options.excludeFile.length > 0) {
        options.excludeFile.forEach(file => {
            contentPaths.push(`!${directory}/**/${file}`);
        });
    }
    const files = await fg(contentPaths);
  const imports = [];
  for (const file of files) {
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
        head: ['File', 'Line', 'Column', 'Import'],
        colWidths: [20, 10, 10, 20],
      });
    
      const tableFiles = new Table({
        head: ['File'],
        colWidths: [20],
      });
    
      if (options.listFiles) {
        files.forEach((file) => {
            tableFiles.push([file]);
        })
      }
      if (options.listImports) {
        imports.forEach((importStatement) => {
          tableImports.push([importStatement.file, importStatement.line, importStatement.column, importStatement.from]);
        })
      }
      return { tableImports, tableFiles };
  }else{
    if (options.listFiles) {
        console.log(chalk.green('***************** Files *****************'));
        files.forEach((file) => {
            console.log(chalk.green(file));
        })
      }
      if (options.listImports) {
        console.log(chalk.yellow('***************** Imports *****************'));
        imports.forEach((importStatement) => {
          console.log(chalk.yellow(`${importStatement.file}:${importStatement.line}:${importStatement.column}  ${importStatement.from}`));
        })
      }
      return { tableImports: imports, tableFiles: files };
  }
}

async function unUsedFiles(chalk,directory = "src", options) {
  const resolver = createResolver(directory);
    const contentPaths = [`${directory}/**/*.{tsx,ts,js,jsx}`];
    if (options.excludeDir && options.excludeDir.length > 0) {
        options.excludeDir.forEach(dir => {
            contentPaths.push(`!${dir}/**`);
        });
    }
    if (options.excludeFile && options.excludeFile.length > 0) {
        options.excludeFile.forEach(file => {
            contentPaths.push(`!${directory}/**/${file}`);
        });
    }
    
    const files = await fg(contentPaths);
    const imports = [];
    const unusedFiles = [];
    for (const file of files) {
      const code = fs.readFileSync(file, "utf8");
      const ast = parser.parse(code, {
        sourceType: "module",
        plugins: [
          "jsx",
          "typescript",
        ],
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
    }

    // console.log('imports', imports);
    // console.log('files', files);
    for (const file of files) {
        let i = 0;
        // console.log('Checking', file);
        let isFound = false;
        while (!isFound && i < imports.length) {
          const importFilePath = await resolver(chalk,imports[i].file, imports[i].from);
          // console.log(chalk.blue('importFilePath'), importFilePath);
            
            if (compareFiles(chalk,path.resolve(file), importFilePath)) {
                isFound = true;
                break;
            }else if(i === imports.length - 1) {
                if(options.excludeFilePrint && options.excludeFilePrint.length > 0) {
                    if(!isExcludedFile(file, options.excludeFilePrint)){
                        unusedFiles.push(file); 
                    }
                }else {
                    unusedFiles.push(file);
                }
                break;
            }
            i++;
        }
    }
    return unusedFiles;
}

function isExcludedFile(file, excludeFiles) {
    return excludeFiles.some(exclude => file.includes(exclude));
}

function compareFiles(chalk,filePath, importPath) {  
  return filePath === importPath;
}

module.exports = {
  getFiles,
  unUsedFiles,
};