const fg = require("fast-glob");
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const Table = require("cli-table3");
const { getCssImages } = require("../utils/cssImages");
const { askDeleteFiles } = require("../utils/utils");

// Regex for matching url("x.png") or url('x.png') or bg-[url('x.png')]
const URL_EXTRACT_REGEX = /url\((['"]?)([^"')]+)\1\)/gi;

// Normal image file regex
const IMAGE_REGEX = /\.(png|jpe?g|svg|gif|webp)$/i;

/**
 * Normalize image paths for consistent matching.
 */
function normalize(value, imageDirectory, {alias = true, isRootFolderReferenced = false}) {
  if (!value) return null;

  // Extract url() paths
  const match = [...value.matchAll(URL_EXTRACT_REGEX)];
  if (match.length > 0) {
    value = match[0][2];
  }

  // Remove query params
  value = value.split("?")[0];

  // Convert leading "/" to relative project path
  if (value.startsWith("/")) {
    return path.resolve(path.join(imageDirectory, value.slice(1)));
  }

  if (alias) {
    // Resolve relative paths
    return path.resolve(path.join(imageDirectory, value));
  }
  // Normalize to logical asset path
  const logicalPath = value
    .replace(/^[@~]\//, "")
    .replace(/^(\.{1,2}\/)+/, "")
    .replace(/^\/+/, "");

  // 1. Split the path into an array of its components
  // path.sep is the platform-specific separator ('/' or '\')
  const pathItems = logicalPath.split(path.sep);

  // 2. Remove the first element of the array
  // The splice method changes the content of an array by removing existing elements.
  // We remove 1 element starting from index 1 (the actual first directory name after the initial separator, if any)
  if (isRootFolderReferenced) {
    pathItems.splice(0, 1);
  }

  // Note: If the path is absolute (starts with a separator), the first item in the array
  // is an empty string, representing the root. The actual first directory is at index 1.

  // 3. Join the remaining components back into a string
  const resultPath = pathItems.join(path.sep);


  const valueResolved = path.resolve(imageDirectory, resultPath);
  return valueResolved;
}

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
function extractFromJSXStyle(node, file, collected) {
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
        matches.forEach((m) =>
          collected.add(JSON.stringify({ path: m[2], file }))
        );
      } else if (IMAGE_REGEX.test(raw)) {
        collected.add(JSON.stringify({ path: raw, file }));
      }
    }

    // Template literal
    if (prop.value.type === "TemplateLiteral") {
      extractFromTemplateLiteral(prop.value.quasis).forEach((v) => {
        collected.add(JSON.stringify({ path: v, file }));
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
function createASTTraverser(file, used) {
  return {
    /**
     * import logo from './img/a.png'
     */
    ImportDeclaration(pathNode) {
      const val = pathNode.node.source.value;
      if (IMAGE_REGEX.test(val)) {
        used.add(JSON.stringify({ path: val, file }));
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
          used.add(JSON.stringify({ path: val, file }));
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
          used.add(JSON.stringify({ path: val, file }));
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
            used.add(JSON.stringify({ path: v.value, file }));
          }
        }

        if (v.type === "JSXExpressionContainer") {
          const expr = v.expression;

          if (expr.type === "StringLiteral") {
            if (IMAGE_REGEX.test(expr.value)) {
              used.add(JSON.stringify({ path: expr.value, file }));
            }
          }

          if (expr.type === "TemplateLiteral") {
            extractFromTemplateLiteral(expr.quasis).forEach((v) => {
              used.add(JSON.stringify({ path: v, file }));
            });
          }
        }
      }

      // Handle style={{ backgroundImage: "url(...)" }}
      if (attr.node.name.name === "style") {
        extractFromJSXStyle(attr.node.value, file, used);
      }
    },

    /**
     * String Literals anywhere
     */
    StringLiteral(p) {
      const val = p.node.value;

      if (IMAGE_REGEX.test(val)) {
        used.add(JSON.stringify({ path: val, file }));
      }

      // detect url("...") inside strings (e.g., Tailwind)
      const matches = [...val.matchAll(URL_EXTRACT_REGEX)];
      matches.forEach((m) => used.add(JSON.stringify({ path: m[2], file })));
    },

    /**
     * Template Literals anywhere
     */
    TemplateLiteral(p) {
      extractFromTemplateLiteral(p.node.quasis).forEach((v) => {
        used.add(JSON.stringify({ path: v, file }));
      });
    },

    /**
     * styled-components & css`` blocks
     */
    TaggedTemplateExpression(p) {
      const quasi = p.node.quasi;
      const extracted = extractFromTemplateLiteral(quasi.quasis);
      extracted.forEach((v) => used.add(JSON.stringify({ path: v, file })));
    },
  };
}

/**
 * Scan code files and extract all image references
 */
async function scanCodeFilesForImages(codeFiles, codeDirectory) {
  const used = new Set();
  let index = 0;

  for (const file of codeFiles) {
    index++;
    console.clear();
    console.log("Scanning code files...", index, "of", codeFiles.length);
    const code = fs.readFileSync(file, "utf8");

    const ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    const traverser = createASTTraverser(file, used);
    traverse(ast, traverser);
  }

  // Add CSS images
  const cssImages = await getCssImages(codeDirectory);
  cssImages.forEach((img) =>
    used.add(JSON.stringify({ path: img.value, file: img.file }))
  );

  return used;
}

/**
 * Normalize all used image paths
 */
function normalizeUsedImages(used, imageDirectory, options, chalk) {
  const normalizedUsed = new Set();
  let index = 0;

  for (const entry of used) {
    index++;
    const { path: p } = JSON.parse(entry);
    const alias = options.alias ? true : false;
    const isRootFolderReferenced = options.isRootFolderReferenced ? true : false;
    const normalized = normalize(p, imageDirectory, {
      alias,
      isRootFolderReferenced,
    });
    console.log(chalk.red("normalized"), normalized);
    if (normalized) normalizedUsed.add(normalized);
  }

  return normalizedUsed;
}

/**
 * Find unused images by comparing image files with normalized used images
 */
function findUnusedImages(imageFiles, normalizedUsed) {
  const unusedImages = [];

  for (const img of imageFiles) {
    const full = path.resolve(img);
    if (!normalizedUsed.has(full)) {
      unusedImages.push(full);
    }
  }

  return unusedImages;
}

/**
 * Display unused images in table or list format
 */
function displayUnusedImages(unusedImages, options, chalk) {
  if (options.table) {
    const table = new Table({
      head: options.dryRun
        ? ["Unused Images (Would Delete)"]
        : ["Unused Images"],
      colWidths: [100],
    });
    unusedImages.forEach((img) => table.push([img]));
    console.log(table.toString());
  } else {
    unusedImages.forEach((img) => console.log(chalk.red(img)));
  }
}

/**
 * Handle deletion logic for unused images
 */
function handleImageDeletion(unusedImages, options, chalk) {
  if (options.dryRun) {
    console.log(
      chalk.cyan(`\n[DRY RUN] Would delete ${unusedImages.length} file(s)`)
    );
  } else if (unusedImages.length > 0) {
    askDeleteFiles(unusedImages);
  }
}

/**
 * MAIN FUNCTION
 */
async function getUnusedImages(chalk, imageDirectory, codeDirectory, options) {
  // Build paths and collect files
  const imagePaths = buildImagePaths(imageDirectory, options);
  const codePaths = buildCodePaths(codeDirectory, options);
  const imageFiles = await fg(imagePaths);
  const codeFiles = await fg(codePaths);

  // Scan code files for image references
  const used = await scanCodeFilesForImages(codeFiles, codeDirectory);

  // Normalize used images
  const normalizedUsed = normalizeUsedImages(
    used,
    imageDirectory,
    options,
    chalk
  );

  // Find unused images
  const unusedImages = findUnusedImages(imageFiles, normalizedUsed);

  // Display results
  displayUnusedImages(unusedImages, options, chalk);

  // Handle deletion
  handleImageDeletion(unusedImages, options, chalk);

  return unusedImages;
}

module.exports = {
  getUnusedImages,
};
