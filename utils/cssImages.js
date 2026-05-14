const fs = require("fs");
const fg = require("fast-glob");
const path = require("path");
const { needsRebuild } = require("./cache");
const { normalize } = require("./resolver");
const {
  createFileNodeInImageGraph,
  createImageNodeFromCssImport,
} = require("./imageGraphUtils");

const URL_REGEX = /url\((['"]?)(.*?)\1\)/g;
const IMAGE_EXTENSION_REGEX = /\.(png|jpg|jpeg|svg|gif|webp)$/i;

/**
 * Extracts image URLs from CSS content using url() patterns
 * @param {string} cssContent - The CSS content to parse
 * @returns {Array<string>} Array of image URLs found
 */
function extractImageUrlsFromCss(cssContent) {
  const imageUrls = [];
  const urlRegex = new RegExp(URL_REGEX);
  let match;

  while ((match = urlRegex.exec(cssContent)) !== null) {
    const url = match[2];
    if (IMAGE_EXTENSION_REGEX.test(url)) {
      imageUrls.push(url);
    }
  }

  return imageUrls;
}

/**
 * Processes a single image URL from CSS and adds it to the graph
 * @param {string} url - The image URL from CSS
 * @param {string} filePath - The CSS file path
 * @param {string} imageDirectory - The base image directory
 * @param {Map} imageGraph - The image graph Map
 * @param {Object} options - Options object
 */
function processCssImageUrl(url, filePath, imageDirectory, imageGraph, options) {
  const importPath = normalize(url, imageDirectory, {
    alias: options.alias ? true : false,
    isRootFolderReferenced: options.isRootFolderReferenced ? true : false,
  });

  if (!importPath) return;

  imageGraph.get(filePath).imports.add(importPath);
  createImageNodeFromCssImport(importPath, imageGraph);
  imageGraph.get(importPath).importedBy.add(filePath);
}

/**
 * Extracts CSS images and updates the image graph
 * @param {string} cssContent - The CSS content
 * @param {string} filePath - The CSS file path
 * @param {string} imageDirectory - The base image directory
 * @param {Map} imageGraph - The image graph Map
 * @param {Object} options - Options object
 */
function extractCssImages(
  cssContent,
  filePath,
  imageDirectory,
  imageGraph,
  options
) {
  createFileNodeInImageGraph(filePath, cssContent, imageGraph);
  const imageUrls = extractImageUrlsFromCss(cssContent);

  imageUrls.forEach((url) => {
    processCssImageUrl(url, filePath, imageDirectory, imageGraph, options);
  });
}

/**
 * Scans CSS files and extracts image references
 * @param {Array<string>} cssFiles - Array of CSS file paths
 * @param {Function} createStepBar - Function to create progress bar
 * @param {string} imageDirectory - The base image directory
 * @param {Map} imageGraph - The image graph Map
 * @param {Object} options - Options object
 * @param {Object} chalk - Chalk instance for colored output
 * @returns {Promise<Map>} Map of file paths to their old import sets
 */
async function scanCssFiles(
  cssFiles,
  createStepBar,
  imageDirectory,
  imageGraph,
  options,
  chalk
) {
  const oldPaths = new Map();
  const scanBar = createStepBar(
    `1/${cssFiles.length}`,
    cssFiles.length,
    "Scanning CSS files",
    chalk
  );

  for (const file of cssFiles) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    scanBar.increment();
    const filePath = path.resolve(file);
    const css = fs.readFileSync(filePath, "utf-8");
    const inNeededRebuild = needsRebuild(filePath, css, imageGraph);

    if (inNeededRebuild) {
      // check if file is already in graph
      if (imageGraph.has(filePath)) {
        const oldFiles = new Set(imageGraph.get(filePath).imports);
        // Create a copy of the Set to avoid it being cleared when extractCssImages clears the original
        oldPaths.set(filePath, new Set(oldFiles));
      }
      extractCssImages(css, filePath, imageDirectory, imageGraph, options);
    }
  }
  scanBar.stop();
  return oldPaths;
}

/**
 * Compares old CSS import paths with new paths and updates the graph
 * @param {Map} oldPaths - Map of file paths to their old import sets
 * @param {Function} createStepBar - Function to create progress bar
 * @param {Map} imageGraph - The image graph Map
 * @param {Object} chalk - Chalk instance for colored output
 * @returns {number} Number of CSS files processed
 */
async function compareCssPaths(oldPaths, createStepBar, imageGraph, chalk) {
  let numberOfCssFiles = 0;
  let compareBar = null;

  if (oldPaths.size > 0) {
    compareBar = createStepBar(
      `1/${oldPaths.size}`,
      oldPaths.size,
      "Comparing CSS files with new paths",
      chalk
    );
  }

  // compare old paths with new path
  for (const [filePath, oldFiles] of oldPaths) {
    if (compareBar) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      compareBar.increment();
    }
    const resolvedFilePath = path.resolve(filePath);
    if (imageGraph.has(resolvedFilePath)) {
      const removedFiles = new Set(
        [...oldFiles].filter((x) => !imageGraph.get(resolvedFilePath).imports.has(x))
      );
      if (removedFiles.size > 0) {
        removedFiles.forEach((file) => {
          if (imageGraph.has(file)) {
            imageGraph.get(file).importedBy.delete(resolvedFilePath);
          }
        });
      }
      // this does account for the case where a file is added to the graph but no images are found in it
      numberOfCssFiles++;
    }
  }

  if (compareBar) {
    compareBar.stop();
  }

  return numberOfCssFiles;
}

/**
 * Main function to get CSS images from a directory
 * @param {string} directory - Directory to scan for CSS files
 * @param {Function} createStepBar - Function to create progress bar
 * @param {string} imageDirectory - The base image directory
 * @param {Map} imageGraph - The image graph Map
 * @param {Object} options - Options object
 * @param {Object} chalk - Chalk instance for colored output
 * @returns {Promise<number>} Number of CSS files processed
 */
async function getCssImages(
  directory = "src",
  createStepBar,
  imageDirectory,
  imageGraph,
  options,
  chalk
) {
  const cssFiles = await fg([`${directory}/**/*.{css,scss}`]);
  const oldPaths = await scanCssFiles(
    cssFiles,
    createStepBar,
    imageDirectory,
    imageGraph,
    options,
    chalk
  );
  const numberOfCssFiles = await compareCssPaths(
    oldPaths,
    createStepBar,
    imageGraph,
    chalk
  );
  return numberOfCssFiles;
}

module.exports = {
  getCssImages,
};
