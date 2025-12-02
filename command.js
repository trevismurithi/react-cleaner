const fg = require("fast-glob");
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;


async function getFiles(directory = "src", options) {
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

  if (options.listFiles) {
    console.log('***************** Files *****************');
    files.forEach((file) => {
        console.log(file);
    })
  }
  if (options.listImports) {
    console.log('***************** Imports *****************');
    imports.forEach((importStatement) => {
      console.log(`${importStatement.file}:${importStatement.line}:${importStatement.column}  ${importStatement.from}`);
    })
  }
}

async function unUsedFiles(directory = "src", options) {
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
            
            if (compareFiles(file, imports[i].from)) {
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

function compareFiles(filePath, importPath) {  
    const importNoExt = importPath.replace(/\.[^/.]+$/, "");
    const prefixImportPath = importNoExt.replace(/^(?:\.{1,2}\/|[@~]+\/)+/, "");
    // console.log('importNoExt', importNoExt, '  prefixImportPath', prefixImportPath, '  filePath', filePath, '  ', filePath.includes(prefixImportPath));
    
    return  filePath.includes(prefixImportPath);
}

module.exports = {
  getFiles,
  unUsedFiles,
};