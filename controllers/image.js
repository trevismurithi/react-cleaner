const fg = require("fast-glob");
const fs = require("fs");
const path = require("path");
const { parseCode } = require("../utils/astParser");
const traverse = require("@babel/traverse").default;
const { getCssImages } = require("../utils/cssImages");
const { createStepBar } = require("../utils/utils");
const { initializeCache } = require("../command");
const { needsRebuild, getFileHash, saveCache } = require("../utils/cache");
const { normalize } = require("../utils/resolver");
const { buildImagePaths, buildCodePaths } = require("../utils/imagePathBuilder");
const { createASTTraverser } = require("../utils/imageAstParser");
const { addToImageGraph } = require("../utils/imageGraphUtils");
const { displayUnusedImages, handleImageDeletion } = require("../utils/imageDisplay");
const { parse } = require("@vue/compiler-sfc");

/**
 * Creates a file node in the image graph for a code file
 * @param {string} filePath - The file path
 * @param {Map} imageGraph - The image graph Map
 */
function createCodeFileNode(filePath, imageGraph) {
  imageGraph.set(filePath, {
    file: filePath,
    size: fs.statSync(filePath).size,
    hash: getFileHash(fs.readFileSync(filePath, "utf8")),
    imports: new Set(),
    importedBy: new Set(),
    isImage: false,
    lastModified: fs.statSync(filePath).mtime.getTime(),
  });
}

/**
 * Processes a single import and adds it to the image graph
 * @param {Object} importInfo - Import information object
 * @param {string} imageDirectory - The base image directory
 * @param {Map} imageGraph - The image graph Map
 * @param {Object} options - Options object
 */
function processImageImport(importInfo, imageDirectory, imageGraph, options) {
  const filePath = path.resolve(importInfo.file);
  let importPath = normalize(importInfo.source, imageDirectory, {
    alias: options.alias ? true : false,
    isRootFolderReferenced: options.isRootFolderReferenced ? true : false,
  });

  if (importPath && !fs.existsSync(importPath)) {
    if (options.alias) {
      importPath = normalize(importInfo.source, imageDirectory, {
        alias: false,
        isRootFolderReferenced: true,
      });
    } else {
      importPath = normalize(importInfo.source, imageDirectory, {
        alias: true,
        isRootFolderReferenced: false,
      });
    }
    addToImageGraph(importPath, imageGraph);
  } else {
    addToImageGraph(importPath, imageGraph);
  }
  if (importPath) {
    imageGraph.get(importPath).importedBy.add(filePath);
    imageGraph.get(filePath).imports.add(importPath);
  }
}

/**
 * Processes all collected image imports
 * @param {Array} imports - Array of import information objects
 * @param {Function} createStepBar - Function to create progress bar
 * @param {string} imageDirectory - The base image directory
 * @param {Map} imageGraph - The image graph Map
 * @param {Object} options - Options object
 * @param {Object} chalk - Chalk instance for colored output
 */
async function processImageImports(
  imports,
  createStepBar,
  imageDirectory,
  imageGraph,
  options,
  chalk
) {
  let packingBar = null;
  if (imports.length > 0) {
    packingBar = createStepBar(
      `1/${imports.length}`,
      imports.length,
      "Scanning imports",
      chalk
    );
  }

  for (const importInfo of imports) {
    if (packingBar) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      packingBar.increment();
    }
    processImageImport(importInfo, imageDirectory, imageGraph, options);
  }

  if (packingBar) {
    packingBar.stop();
  }
}

/**
 * Compares old import paths with new paths and updates the graph
 * @param {Map} oldPaths - Map of file paths to their old import sets
 * @param {Function} createStepBar - Function to create progress bar
 * @param {Map} imageGraph - The image graph Map
 * @param {Object} chalk - Chalk instance for colored output
 * @returns {number} Number of files with removed imports
 */
async function compareCodePaths(oldPaths, createStepBar, imageGraph, chalk) {
  let removedFilesCount = 0;
  let compareBar = null;

  if (oldPaths.size > 0) {
    compareBar = createStepBar(
      `1/${oldPaths.size}`,
      oldPaths.size,
      "Comparing old paths with new paths",
      chalk
    );
  }

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

  return removedFilesCount;
}

/**
 * Scan code files and extract all image references
 * @param {Object} chalk - Chalk instance for colored output
 * @param {Array<string>} codeFiles - Array of code file paths
 * @param {string} codeDirectory - The base code directory
 * @param {string} imageDirectory - The base image directory
 * @param {Map} imageGraph - The image graph Map
 * @param {Object} options - Options object
 * @returns {Promise<number>} Number indicating if any changes were made
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
      const extension = path.extname(filePath);
      let ast = null;
      if(extension === '.vue') {
        const {descriptor} = parse(code);
        if(descriptor.scriptSetup || descriptor.script) {
          ast = parseCode(descriptor.scriptSetup?.content || descriptor.script?.content||'');
        }
      }else {
        ast = parseCode(code);
      }
      if (imageGraph.has(filePath)) {
        const oldFiles = new Set(imageGraph.get(filePath).imports);
        // Create a copy of the Set to avoid it being cleared/modified when imageGraph is updated
        oldPaths.set(filePath, new Set(oldFiles));
      }
      createCodeFileNode(filePath, imageGraph);
      const traverser = createASTTraverser(filePath, imports);
      traverse(ast, traverser);
    }
  }

  scanBar.stop();

  await processImageImports(
    imports,
    createStepBar,
    imageDirectory,
    imageGraph,
    options,
    chalk
  );

  const removedFilesCount = await compareCodePaths(
    oldPaths,
    createStepBar,
    imageGraph,
    chalk
  );

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
 * @param {Object} imageParentGraph - Object containing imageGraph and unusedImages
 * @param {Array<string>} imageFiles - Array of image file paths
 * @param {Object} options - Options object
 * @returns {Set} Set of unused images
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



module.exports = {
  getUnusedImages,
};
