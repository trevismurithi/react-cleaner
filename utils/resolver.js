const path = require('path');
const fs = require('fs');
const {create} = require('enhanced-resolve');


function createResolver(directory) {
const resolver = create({
    extensions: [".js", ".jsx", ".ts", ".tsx"],
    alias: {
      "@": path.resolve(directory),
      "~": path.resolve(directory)
    },
    mainFiles: ["index"],
    // Where resolution begins
    modules: [
        path.resolve(directory)
    ]
  });

  return function resolveImport(sourceFile, importPath) {
    // console.log(chalk.yellow('sourceFile--resolver'), sourceFile, chalk.yellow('importPath--resolver'), importPath);
    return new Promise((resolve, reject) => {
      resolver(path.dirname(sourceFile), importPath, (err, result) => {
        if (err) return resolve(null);
        resolve(path.resolve(result));
      });
    });
  }
}




module.exports = {
  createResolver,
};