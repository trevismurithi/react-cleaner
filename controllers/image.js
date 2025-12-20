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
        matches.forEach((m) =>{
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
      imagePaths.push(`!${dir}/**`);
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
      codePaths.push(`!${dir}/**`);
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
          matches.forEach((m) => imports.push({
            file: file,
            source: m[2],
          }));
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
      matches.forEach((m) => imports.push({
        file: file,
        source: m[2],
      }));
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
      extracted.forEach((v) => imports.push({
        file: file,
        source: v,
      }));
    },
  };
}

/**
 * Scan code files and extract all image references
 */
async function scanCodeFilesForImages(chalk, codeFiles, codeDirectory, imageDirectory, imageGraph, options) {
  const imports = [];
  const scanBar = createStepBar(`1/${codeFiles.length}`, codeFiles.length, "Scanning code files", chalk);
  for (const file of codeFiles) {
    await new Promise(resolve => setTimeout(resolve, 50));
    scanBar.increment();
    const code = fs.readFileSync(file, "utf8");
    if (needsRebuild(file, code, imageGraph)) {
      const ast = parser.parse(code, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      });
      const traverser = createASTTraverser(file, imports);
      traverse(ast, traverser);
    }
  }
  // Process all collected imports once after scanning all files
  for (const importInfo of imports) {
    const filePath = path.resolve(importInfo.file);
    const importPath = normalize(importInfo.source, imageDirectory, {
      alias: options.alias ? true : false,
      isRootFolderReferenced: options.isRootFolderReferenced ? true : false,
    });
    if(!fs.existsSync(importPath)) {
      // referenced image not found, indicate it as unused
      if (importPath && !imageGraph.has(importPath)) {
        imageGraph.set(importPath, {
          file: importPath,
          size: 0,
          hash: null,
          imports: new Set(),
          importedBy: new Set(),
          lastModified: null,
        });
      }
    }else {
      if (importPath && !imageGraph.has(importPath)) {
        imageGraph.set(importPath, {
          file: importPath,
          size: fs.statSync(importPath).size,
          hash: getFileHash(fs.readFileSync(importPath, 'utf8')),
          imports: new Set(),
          importedBy: new Set(),
          lastModified: fs.statSync(importPath).mtime.getTime(),
        });
      }
    }
    importPath &&imageGraph.get(importPath).importedBy.add(filePath);
  }

  // Add CSS images
  await getCssImages(codeDirectory, createStepBar, imageDirectory, imageGraph, options, chalk);
  scanBar.stop();
}


/**
 * Find unused images by comparing image files with normalized used images
 */
function findUnusedImages(imageGraph, imageFiles, options) {
  const unusedImages = new Set();

  for (const imageFile of imageFiles) {
    const filePath = path.resolve(imageFile);
    const image = imageGraph.get(filePath);
    // image not found in imageGraph, indicate it as unused
    if (!image) {
      unusedImages.add({
        file: filePath,
        size: fs.statSync(imageFile).size,
        hash: getFileHash(fs.readFileSync(imageFile, 'utf8')),
        imports: new Set(),
        importedBy: new Set(),
        lastModified: fs.statSync(imageFile).mtime.getTime(),
      });
    }
  }
  if(options.hideNotFoundImages) {
    return unusedImages;
  }
  // find unused images in imageGraph
  for (const [filePath, image] of imageGraph) {
    if (image.importedBy.size === 0 || image.size === 0) {
      unusedImages.add(image);
    }
  }

  return unusedImages;
}

/**
 * Display unused images in table or list format
 */
function displayUnusedImages(unusedImages, options, chalk) {
  let totalSize = 0;
  if (options.table) {
    const table = new Table({
      head: options.dryRun
        ? ["Unused Images (Would Delete)", "exists in code","image exists","Size"]
        : ["Unused Images"],
      colWidths: [100],
    });
    unusedImages.forEach((img) => {
      table.push([img.file, img.hash===null ? 'Yes' : 'No', img.hash? 'Yes' : 'No', img.size>0 ? (img.size/(1024*1024)).toFixed(2) + ' MB' : 'N/A']),
      totalSize += img.size
    });
    console.log(table.toString());
  } else {
    unusedImages.forEach((img) => {
      console.log(chalk.red(img.file) + ' - exists in code: ' + chalk.green(img.hash===null ? 'Yes' : 'No') + ' - image exists: ' + chalk.green(img.hash? 'Yes' : 'No') + ' - size: ' + chalk.green(img.size>0 ? (img.size/(1024*1024)).toFixed(2) + ' MB' : 'N/A'));
      totalSize += img.size;
    })
  }
  console.log(chalk.yellow('Total size: ' + (totalSize/(1024*1024)).toFixed(2) + ' MB'));
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
    askDeleteFiles(Array.from(unusedImages.keys()));
  }
}

/**
 * MAIN FUNCTION
 */
async function getUnusedImages(ora, chalk, imageDirectory, codeDirectory, options) {
  // Start spinner
  const spinner = ora("Start Qleaner scan...").start();
  // Build paths and collect files
  spinner.text = "🔍 Discovering image files...";
  const imagePaths = buildImagePaths(imageDirectory, options);
  const codePaths = buildCodePaths(codeDirectory, options);
  const imageFiles = await fg(imagePaths);
  const codeFiles = await fg(codePaths);
  spinner.succeed(`Found ${imageFiles.length} image files and ${codeFiles.length} code files`);
  const { graph, imageGraph } = initializeCache(spinner, options, false);

  const LOG_PREFIX = "Qleaner scan";
  console.time(LOG_PREFIX);
  // Scan code files for image references
  spinner.text = "🔍 Scanning code files for image references...";
  await scanCodeFilesForImages(chalk, codeFiles, codeDirectory, imageDirectory, imageGraph, options);
  spinner.succeed(`Scanned ${codeFiles.length} code files`);

  // Find unused images
  const unusedImages = findUnusedImages(imageGraph, imageFiles, options);
  spinner.succeed(`Found ${unusedImages.size} unused images`);
  // Display results
  displayUnusedImages(unusedImages, options, chalk);
  spinner.succeed(`Displayed ${unusedImages.size} unused images`);
  console.timeEnd(LOG_PREFIX);
  // save cache
  saveCache(process.cwd(), { graph, imageGraph, isCode: false });
  // Handle deletion
  handleImageDeletion(unusedImages, options, chalk);
  spinner.succeed(`Handled deletion of ${unusedImages.size} unused images`);
  spinner.succeed(`Completed Qleaner scan`);
  return unusedImages;
}

module.exports = {
  getUnusedImages,
};
