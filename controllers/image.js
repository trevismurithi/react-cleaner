const fg = require("fast-glob");
const fs = require("fs");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const { getCssImages } = require("../utils/cssImages");
const path = require("path");
const { createResolver } = require("../utils/resolver");
const { compareFiles, isExcludedFile, askDeleteFiles } = require("../utils/utils");
const Table = require('cli-table3');

async function getUnusedImages(chalk, imageDirectory, codeDirectory, options) {
  const usedImages = [];
  const unusedImages = [];
  const imageRegex = /\.(png|jpg|jpeg|svg|gif|webp)$/i;
  const contentPaths = [`${imageDirectory}/**/*.{png,jpg,jpeg,svg,gif,webp}`];
  if (options.excludeDirAssets && options.excludeDirAssets.length > 0) {
    options.excludeDirAssets.forEach((dir) => {
      contentPaths.push(`!${dir}/**`);
    });
  }
  if (options.excludeFileAsset && options.excludeFileAsset.length > 0) {
    options.excludeFileAsset.forEach((file) => {
      contentPaths.push(`!${imageDirectory}/**/${file}`);
    });
  }

  const rootPaths = [`${codeDirectory}/**/*.{js,jsx,ts,tsx}`];
  if (options.excludeDirCode && options.excludeDirCode.length > 0) {
    options.excludeDirCode.forEach((dir) => {
      rootPaths.push(`!${dir}/**`);
    });
  }
  if (options.excludeFileCode && options.excludeFileCode.length > 0) {
    options.excludeFileCode.forEach((file) => {
      rootPaths.push(`!${codeDirectory}/**/${file}`);
    });
  }

  const files = await fg(contentPaths);
  const codeFiles = await fg(rootPaths);

  for (const file of codeFiles) {

    const code = fs.readFileSync(file, "utf8");
    const ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    traverse(ast, {
      // <img src="...">
      JSXAttribute(path) {
        if (path.node.name.name !== "src") return;

        const value = path.node.value;

        // String literals: `img/a.png`
        if (value.type === "StringLiteral") {
          if (imageRegex.test(value.value)) {
            usedImages.push({
              value: value.value,
              file,
            });
          }
        }

        if (value.type === "JSXExpressionContainer") {
          const expr = value.expression;
          // String literals: `img/a.png`
          if (expr.type === "StringLiteral" && imageRegex.test(expr.value)) {
            usedImages.push({
              value: expr.value,
              file,
            });
          }

          // Template literals: `/images/${name}.png`
          if (expr.type === "TemplateLiteral") {
            expr.quasis.forEach((q) => {
              if (imageRegex.test(q.value.raw)) {
                usedImages.push({
                  value: q.value.raw,
                  file,
                });
              }
            });
          }
        }
      },

      // String literals anywhere in code
      StringLiteral(path) {
        if (imageRegex.test(path.node.value)) {
          usedImages.push({
            value: path.node.value,
            file,
          });
        }
      },

      // Template literals: `/images/${name}.png`
      TemplateLiteral(path) {
        path.node.quasis.forEach((quasi) => {
          if (imageRegex.test(quasi.value.raw)) {
            usedImages.push({
              value: quasi.value.raw,
              file,
            });
          }
        });
      },

      // Arrays: ["img/a.png", "img/b.png"]
      ArrayExpression(path) {
        path.node.elements.forEach((el) => {
          if (el?.type === "StringLiteral" && imageRegex.test(el.value)) {
            usedImages.push({
              value: el.value,
              file,
            });
          }
        });
      },

      // Objects: { image: "img/a.png" }
      ObjectProperty(path) {
        const val = path.node.value;
        if (val.type === "StringLiteral" && imageRegex.test(val.value)) {
          usedImages.push({
            value: val.value,
            file,
          });
        }
      },
    });
  }

  const cssImages = await getCssImages(codeDirectory);
  const combinedImages = [...usedImages, ...cssImages];


  const resolver = createResolver(imageDirectory);

  for (const file of files) {
    let i = 0
    let isFound = false;
    while(!isFound && i < combinedImages.length) {
        const imageFilePath = await resolver(path.resolve(combinedImages[i].file), combinedImages[i].value);
        if(compareFiles(path.resolve(file), imageFilePath)) {
            isFound = true;
            break;
        }else if(i === combinedImages.length - 1) {
            if(options.excludeFilePrint && options.excludeFilePrint.length > 0) {
                if(!isExcludedFile(file, options.excludeFilePrint)) {
                    unusedImages.push(file);
                }
            }else{
                unusedImages.push(file);
            }
        }
        i++;
    }
  }

  if(options.table) {
    const table = new Table({
      head: options.dryRun ? ['Unused Images (Would Delete)'] : ['Unused Images'],
      colWidths: [50]
    });
    unusedImages.forEach(image => {
      table.push([image]);
    });
    console.log(table.toString());
  }else{
    unusedImages.forEach(image => {
      console.log(chalk.red(image));
    });
  }

  if(options.dryRun && unusedImages.length > 0) {
    console.log(chalk.cyan(`\n[DRY RUN] Would delete ${unusedImages.length} file(s)`));
    console.log(chalk.cyan('Run without --dry-run to actually delete files\n'));
  } else if (!options.dryRun && unusedImages.length > 0) {
    askDeleteFiles(unusedImages);
  }
  return unusedImages;
}

module.exports = {
  getUnusedImages,
};
