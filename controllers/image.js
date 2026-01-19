const fg = require("fast-glob");
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const Table = require("cli-table3");
const { getCssImages } = require("../utils/cssImages");
const { askDeleteFiles, createStepBar } = require("../utils/utils");
const { initializeCache } = require("../command");
const { needsRebuild, getFileHash, saveCache } = require("../utils/cache");
const { normalize } = require("../utils/resolver");
const { URL_EXTRACT_REGEX, IMAGE_REGEX } = require("../utils/constants");
const { formatFilePath } = require("./summary");

/**
 * Extracts all strings in a tagged template literal (styled-components, css``)
 */
function extractFromTemplateLiteral(quasis) {
  const results = [];
  quasis.forEach((q) => {
    const matches = [...q.value.raw.matchAll(URL_EXTRACT_REGEX)];
    for (const m of matches) {
      results.push(m[2]);
    }
    if (IMAGE_REGEX.test(q.value.raw)) {
      results.push(q.value.raw);
    }
  });
  return results;
}

/**
 * Extract images from JSX style object: style={{ backgroundImage: "url('/img/a.png')" }}
 */
function extractFromJSXStyle(node, file, imports) {
  if (!node || node.type !== "JSXExpressionContainer") return;

  const expr = node.expression;
  if (!expr || expr.type !== "ObjectExpression") return;

  expr.properties.forEach((prop) => {
    if (prop.type !== "ObjectProperty" || !prop.key || !prop.value) return;

    const keyName = prop.key.name || prop.key.value;

    if (!keyName) return;

    const isImageField =
      keyName.toLowerCase().includes("background") ||
      keyName.toLowerCase().includes("image") ||
      keyName.toLowerCase().includes("mask");

    if (!isImageField) return;

    // String literal
    if (prop.value.type === "StringLiteral") {
      const raw = prop.value.value;
      const matches = [...raw.matchAll(URL_EXTRACT_REGEX)];
      if (matches.length > 0) {
        matches.forEach((m) => {
          imports.push({
            file: file,
            source: m[2],
          });
        });
      } else if (IMAGE_REGEX.test(raw)) {
        imports.push({
          file: file,
          source: raw,
        });
      }
    }

    // Template literal
    if (prop.value.type === "TemplateLiteral") {
      extractFromTemplateLiteral(prop.value.quasis).forEach((v) => {
        imports.push({
          file: file,
          source: v,
        });
      });
    }
  });
}

/**
 * Build glob patterns for image files with exclusions
 */
function buildImagePaths(imageDirectory, options) {
  const imagePaths = [`${imageDirectory}/**/*.{png,jpg,jpeg,svg,gif,webp}`];

  if (options.excludeDirAssets && options.excludeDirAssets.length > 0) {
    options.excludeDirAssets.forEach((dir) => {
      imagePaths.push(`!${imageDirectory}/**/${dir}/**`);
    });
  }
  if (options.excludeFileAssets && options.excludeFileAssets.length > 0) {
    options.excludeFileAssets.forEach((file) => {
      imagePaths.push(`!${imageDirectory}/**/${file}`);
    });
  }

  return imagePaths;
}

/**
 * Build glob patterns for code files with exclusions
 */
function buildCodePaths(codeDirectory, options) {
  const codePaths = [`${codeDirectory}/**/*.{js,jsx,ts,tsx}`];

  if (options.excludeDirCode && options.excludeDirCode.length > 0) {
    options.excludeDirCode.forEach((dir) => {
      codePaths.push(`!${codeDirectory}/**/${dir}/**`);
    });
  }
  if (options.excludeFileCode && options.excludeFileCode.length > 0) {
    options.excludeFileCode.forEach((file) => {
      codePaths.push(`!${codeDirectory}/**/${file}`);
    });
  }

  return codePaths;
}

/**
 * Create AST traverser with handlers for extracting image references
 */
function createASTTraverser(file, imports) {
  return {
    /**
     * import logo from './img/a.png'
     */
    ImportDeclaration(pathNode) {
      const val = pathNode.node.source.value;
      if (IMAGE_REGEX.test(val)) {
        imports.push({
          file: file,
          source: val,
        });
      }
    },

    /**
     * require('./img/a.png')
     */
    CallExpression(pathNode) {
      const callee = pathNode.node.callee;
      const args = pathNode.node.arguments;

      if (
        callee.type === "Identifier" &&
        callee.name === "require" &&
        args.length &&
        args[0].type === "StringLiteral"
      ) {
        const val = args[0].value;
        if (IMAGE_REGEX.test(val)) {
          imports.push({
            file: file,
            source: val,
          });
        }
      }

      // dynamic import("./a.png")
      if (
        callee.type === "Import" &&
        args.length &&
        args[0].type === "StringLiteral"
      ) {
        const val = args[0].value;
        if (IMAGE_REGEX.test(val)) {
          imports.push({
            file: file,
            source: val,
          });
        }
      }
    },

    /**
     * <img src="...">
     */
    JSXAttribute(attr) {
      if (attr.node.name.name === "src") {
        const v = attr.node.value;
        if (!v) return;

        if (v.type === "StringLiteral") {
          if (IMAGE_REGEX.test(v.value)) {
            imports.push({
              file: file,
              source: v.value,
            });
          }
        }

        if (v.type === "JSXExpressionContainer") {
          const expr = v.expression;

          if (expr.type === "StringLiteral") {
            if (IMAGE_REGEX.test(expr.value)) {
              imports.push({
                file: file,
                source: expr.value,
              });
            }
          }

          if (expr.type === "TemplateLiteral") {
            extractFromTemplateLiteral(expr.quasis).forEach((v) => {
              imports.push({
                file: file,
                source: v,
              });
            });
          }
        }
      }

      // Handle style={{ backgroundImage: "url(...)" }}
      if (attr.node.name.name === "style") {
        extractFromJSXStyle(attr.node.value, file, imports);
      }
    },

    /**
     * Array expressions: const images = ['/img/a.png', '/img/b.png']
     * This explicitly handles arrays of image paths, including spread elements
     */
    ArrayExpression(p) {
      p.node.elements.forEach((element) => {
        if (!element) return; // Skip null/undefined elements (e.g., [1, , 3])

        // Handle string literals in arrays
        if (element.type === "StringLiteral") {
          const val = element.value;
          if (IMAGE_REGEX.test(val)) {
            imports.push({
              file: file,
              source: val,
            });
          }
          // detect url("...") inside strings
          const matches = [...val.matchAll(URL_EXTRACT_REGEX)];
          matches.forEach((m) =>
            imports.push({
              file: file,
              source: m[2],
            })
          );
        }

        // Handle template literals in arrays
        if (element.type === "TemplateLiteral") {
          extractFromTemplateLiteral(element.quasis).forEach((v) => {
            imports.push({
              file: file,
              source: v,
            });
          });
        }

        // Handle spread elements: [...otherArray, '/img/a.png']
        if (element.type === "SpreadElement" && element.argument) {
          // The spread element's argument will be visited by other handlers
          // but we can explicitly check if it's an array with string literals
          if (element.argument.type === "ArrayExpression") {
            element.argument.elements.forEach((spreadEl) => {
              if (spreadEl && spreadEl.type === "StringLiteral") {
                const val = spreadEl.value;
                if (IMAGE_REGEX.test(val)) {
                  imports.push({
                    file: file,
                    source: val,
                  });
                }
              }
            });
          }
        }
      });
    },

    /**
     * String Literals anywhere
     */
    StringLiteral(p) {
      const val = p.node.value;

      if (IMAGE_REGEX.test(val)) {
        imports.push({
          file: file,
          source: val,
        });
      }

      // detect url("...") inside strings (e.g., Tailwind)
      const matches = [...val.matchAll(URL_EXTRACT_REGEX)];
      matches.forEach((m) =>
        imports.push({
          file: file,
          source: m[2],
        })
      );
    },

    /**
     * Template Literals anywhere
     */
    TemplateLiteral(p) {
      extractFromTemplateLiteral(p.node.quasis).forEach((v) => {
        imports.push({
          file: file,
          source: v,
        });
      });
    },

    /**
     * styled-components & css`` blocks
     */
    TaggedTemplateExpression(p) {
      const quasi = p.node.quasi;
      const extracted = extractFromTemplateLiteral(quasi.quasis);
      extracted.forEach((v) =>
        imports.push({
          file: file,
          source: v,
        })
      );
    },
  };
}

/**
 * Scan code files and extract all image references
 */
async function scanCodeFilesForImages(
  chalk,
  codeFiles,
  codeDirectory,
  imageDirectory,
  imageGraph,
  options
) {
  const imports = [];
  const oldPaths = new Map();
  const scanBar = createStepBar(
    `1/${codeFiles.length}`,
    codeFiles.length,
    "Scanning code files",
    chalk
  );
  for (const file of codeFiles) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    scanBar.increment();
    const filePath = path.resolve(file);
    const code = fs.readFileSync(filePath, "utf8");
    if (needsRebuild(filePath, code, imageGraph)) {
      const ast = parser.parse(code, {
        sourceType: "module",
        plugins: ["jsx", "typescript", "decorators-legacy"],
      });
      if (imageGraph.has(filePath)) {
        const oldFiles = new Set(imageGraph.get(filePath).imports);
        // Create a copy of the Set to avoid it being cleared/modified when imageGraph is updated
        oldPaths.set(filePath, new Set(oldFiles));
      }
      imageGraph.set(filePath, {
        file: filePath,
        size: fs.statSync(filePath).size,
        hash: getFileHash(fs.readFileSync(filePath, "utf8")),
        imports: new Set(),
        importedBy: new Set(),
        isImage: false,
        lastModified: fs.statSync(filePath).mtime.getTime(),
      });
      const traverser = createASTTraverser(filePath, imports);
      traverse(ast, traverser);
    }
  }
  scanBar.stop();
  let packingBar = null;
  // check if imports is empty
  if (imports.length > 0) {
    packingBar = createStepBar(
      `1/${imports.length}`,
      imports.length,
      "Scanning imports",
      chalk
    );
  }
  // Process all collected imports once after scanning all files
  for (const importInfo of imports) {
    if (packingBar) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      packingBar.increment();
    }
    const filePath = path.resolve(importInfo.file);
    let importPath = normalize(importInfo.source, imageDirectory, {
      alias: options.alias ? true : false,
      isRootFolderReferenced: options.isRootFolderReferenced ? true : false,
    });
    if (importPath && !fs.existsSync(importPath)) {
      if(options.alias) {
        importPath = normalize(importInfo.source, imageDirectory, {
          alias: false,
          isRootFolderReferenced: true,
        });
      }else {
        importPath = normalize(importInfo.source, imageDirectory, {
          alias: true,
          isRootFolderReferenced: false,
        });
      }
      addToImageGraph(importPath, imageGraph);
    } else {
      addToImageGraph(importPath, imageGraph);
    }
    importPath && imageGraph.get(importPath).importedBy.add(filePath);
    importPath && imageGraph.get(filePath).imports.add(importPath);
  }

  if (packingBar) {
    packingBar.stop();
  }

  let compareBar = null;
  if (oldPaths.size > 0) {
    compareBar = createStepBar(
      `1/${oldPaths.size}`,
      oldPaths.size,
      "Comparing old paths with new paths",
      chalk
    );
  }

  // count the number of removed files
  let removedFilesCount = 0;
  // compare old paths with new paths
  for (const [filePath, oldFiles] of oldPaths) {
    if (compareBar) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      compareBar.increment();
    }
    if (imageGraph.has(filePath)) {
      const removedFiles = new Set(
        [...oldFiles].filter((x) => !imageGraph.get(filePath).imports.has(x))
      );
      if (removedFiles.size > 0) {
        removedFiles.forEach((file) => {
          if (imageGraph.has(file)) {
            imageGraph.get(file).importedBy.delete(filePath);
          }
        });
      }
      removedFilesCount++;
    }
  }
  if (compareBar) {
    compareBar.stop();
  }
  // Add CSS images
  const numberOfCssFiles = await getCssImages(
    codeDirectory,
    createStepBar,
    imageDirectory,
    imageGraph,
    options,
    chalk
  );
  return imports.length || removedFilesCount || numberOfCssFiles;
}

/**
 * Find unused images by comparing image files with normalized used images
 */
function findUnusedImages(imageParentGraph, imageFiles, options) {
  for (const imageFile of imageFiles) {
    const filePath = path.resolve(imageFile);
    const image = imageParentGraph.imageGraph.get(filePath);
    // image not found in imageGraph, indicate it as unused
    if (!image) {
      imageParentGraph.unusedImages.add({
        file: filePath,
        size: fs.statSync(imageFile).size,
        hash: getFileHash(fs.readFileSync(imageFile, "utf8")),
        isImage: true,
        imports: new Set(),
        importedBy: new Set(),
        lastModified: fs.statSync(imageFile).mtime.getTime(),
      });
    } else if (image && image.importedBy.size === 0 && image.isImage) {
      imageParentGraph.unusedImages.add({
        ...image,
        imports: new Set(image.imports),
        importedBy: new Set(image.importedBy),
      });
    }
  }
  if (options.hideNotFoundImages) {
    return imageParentGraph.unusedImages;
  }
  // find unused images in imageGraph
  for (const [, image] of imageParentGraph.imageGraph) {
    if ((image.importedBy.size === 0 || image.size === 0) && image.isImage) {
      imageParentGraph.unusedImages.add({
        ...image,
        imports: new Set(image.imports),
        importedBy: new Set(image.importedBy),
      });
    }
  }

  return imageParentGraph.unusedImages;
}

/**
 * Display unused images in table or list format
 */
function displayUnusedImages(unusedImages, options, chalk) {
  let totalSize = 0;
  
  if (unusedImages.length === 0) {
    console.log(chalk.green.bold("\n✓ No unused images found!"));
    console.log(chalk.green("════════════════════════════════════════════════\n"));
    return;
  }

  if (options.dryRun) {
    console.log(chalk.cyan.bold('\n[DRY RUN MODE] No images will be deleted\n'));
  }

  if (options.table) {
    const table = new Table({
      head: options.dryRun
        ? [
            chalk.cyan("Unused Images (Would Delete)"),
            chalk.cyan("In Code"),
            chalk.cyan("Exists"),
            chalk.cyan("Size"),
          ]
        : [
            chalk.cyan("Unused Images"),
            chalk.cyan("In Code"),
            chalk.cyan("Exists"),
            chalk.cyan("Size"),
          ],
      colWidths: [75, 10, 10, 15],
      style: { head: [], border: [] }
    });
    
    unusedImages.forEach((img) => {
      const inCode = img.hash === null;
      const exists = img.hash !== null;
      const size = img.size > 0 ? (img.size / (1024 * 1024)).toFixed(2) + " MB" : "N/A";
      
      table.push([
        chalk.white(formatFilePath(img.file, 70)),
        inCode ? chalk.red("Yes") : chalk.green("No"),
        exists ? chalk.green("Yes") : chalk.red("No"),
        chalk.yellow(size),
      ]);
      totalSize += img.size;
    });
    console.log(table.toString());
  } else {
    unusedImages.forEach((img) => {
      const inCode = img.hash === null;
      const exists = img.hash !== null;
      const size = img.size > 0 ? (img.size / (1024 * 1024)).toFixed(2) + " MB" : "N/A";
      
      console.log(
        chalk.white("🖼️  ") +
        chalk.blue(formatFilePath(img.file, 85)) +
        " - " +
        chalk.cyan("in code: ") +
        (inCode ? chalk.red("Yes") : chalk.green("No")) +
        " - " +
        chalk.cyan("exists: ") +
        (exists ? chalk.green("Yes") : chalk.red("No")) +
        " - " +
        chalk.cyan("size: ") +
        chalk.yellow(size)
      );
      totalSize += img.size;
    });
  }
  
  // Summary section
  console.log(chalk.green("\n════════════════════════════════════════════════"));
  console.log(
    chalk.yellow.bold("Total Size: ") + 
    chalk.yellow((totalSize / (1024 * 1024)).toFixed(2) + " MB")
  );
  console.log(
    chalk.magenta.bold("Total Images: ") + 
    chalk.magenta(unusedImages.size)
  );
  console.log(chalk.green("════════════════════════════════════════════════\n"));
}

/**
 * Handle deletion logic for unused images
 */
function handleImageDeletion(unusedImages, options, chalk) {
  if (options.dryRun) {
    console.log(
      chalk.cyan(`\n[DRY RUN] Would delete ${unusedImages.size} file(s)`)
    );
  } else if (unusedImages.size > 0) {
    askDeleteFiles(unusedImages, false);
  }
}

/**
 * MAIN FUNCTION
 */
async function getUnusedImages(
  ora,
  chalk,
  imageDirectory,
  codeDirectory,
  options
) {
  // check if qleaner.config.json exists
  if (fs.existsSync(path.join(process.cwd(), "qleaner.config.json"))) {
    const config = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "qleaner.config.json"), "utf8")
    );
    options = {
      ...config,
      ...options,
    };
    if(options.alias === options.isRootFolderReferenced) {
      console.log(chalk.red("Error: alias and isRootFolderReferenced cannot be the same"));
      console.log(chalk.red("Please set one of them to true"));
      console.log(chalk.red("Example:"));
      console.log(chalk.red("qleaner image public/images src -a"));
      console.log(chalk.red("qleaner image public/images src -r"));
      console.log(chalk.red("Or set one of them to false in the config file"));
      console.log(chalk.red("Example:"));
      console.log(chalk.red("qleaner.config.json:"));
      console.log(chalk.red('{'));
      console.log(chalk.red('  "alias": false,'));
      console.log(chalk.red('  "isRootFolderReferenced": true,'));
      console.log(chalk.red('}'));
      console.log(chalk.red("Or set one of them to true in the config file"));
      console.log(chalk.red("Example:"));
      console.log(chalk.red("qleaner.config.json:"));
      console.log(chalk.red('{'));
      console.log(chalk.red('  "alias": true,'));
      console.log(chalk.red('  "isRootFolderReferenced": false,'));
      console.log(chalk.red('}'));
      process.exit(1);
    }
  }
  // read qleaner.config.json
  // Start spinner
  const spinner = ora("Start Qleaner scan...").start();
  // Build paths and collect files
  spinner.text = "🔍 Discovering image files...";
  const imagePaths = buildImagePaths(imageDirectory, options);
  const codePaths = buildCodePaths(codeDirectory, options);
  const imageFiles = await fg(imagePaths);
  const codeFiles = await fg(codePaths);
  spinner.succeed(
    `Found ${imageFiles.length} image files and ${codeFiles.length} code files`
  );
  const { parentGraph, imageParentGraph } = initializeCache(
    spinner,
    options,
    false
  );

  const LOG_PREFIX = "Qleaner scan";
  console.time(LOG_PREFIX);
  // Scan code files for image references
  spinner.text = "🔍 Scanning code files for image references...";
  const numberOfCodeFiles = await scanCodeFilesForImages(
    chalk,
    codeFiles,
    codeDirectory,
    imageDirectory,
    imageParentGraph.imageGraph,
    options
  );
  spinner.succeed(`Scanned ${codeFiles.length} code files`);

  if (imageParentGraph.unusedImages.size === 0 || numberOfCodeFiles > 0) {
    // Find unused images
    imageParentGraph.unusedImages = new Set();
    findUnusedImages(imageParentGraph, imageFiles, options);
  }

  spinner.succeed(`Found ${imageParentGraph.unusedImages.size} unused images`);
  // Display results
  displayUnusedImages(imageParentGraph.unusedImages, options, chalk);
  spinner.succeed(
    `Displayed ${imageParentGraph.unusedImages.size} unused images`
  );
  console.timeEnd(LOG_PREFIX);
  // save cache
  saveCache(process.cwd(), { parentGraph, imageParentGraph }, false);
  // Handle deletion
  handleImageDeletion(imageParentGraph.unusedImages, options, chalk);
  spinner.succeed(
    `Handled deletion of ${imageParentGraph.unusedImages.size} unused images`
  );
  spinner.succeed(`Completed Qleaner scan`);
}

function addToImageGraph(importPath, imageGraph) {
  if (importPath && !imageGraph.has(importPath)) {
    let size = 0;
    let hash = null;
    let lastModified = null;
    try {
      size = fs.statSync(importPath).size;
      hash = getFileHash(fs.readFileSync(importPath, "utf8"));
      lastModified = fs.statSync(importPath).mtime.getTime();
    } catch {
      size = 0;
      hash = null;
      lastModified = null;
    }
    imageGraph.set(importPath, {
      file: importPath,
      size: size,
      hash: hash,
      imports: new Set(),
      importedBy: new Set(),
      lastModified: lastModified,
      isImage: true,
    });
  }
}


module.exports = {
  getUnusedImages,
};
