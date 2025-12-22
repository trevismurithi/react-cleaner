const fs = require('fs');
const fg = require('fast-glob');
const path = require('path');
const { getFileHash, needsRebuild } = require('./cache');
const { normalize } = require('./resolver');

function extractCssImages(cssContent, filePath, imageDirectory, imageGraph, options) {
  const urlRegex = /url\((['"]?)(.*?)\1\)/g;
  let match;

  while ((match = urlRegex.exec(cssContent)) !== null) {
    const url = match[2];

    // Only collect image file types
    if (/\.(png|jpg|jpeg|svg|gif|webp)$/i.test(url)) {
      const importPath = normalize(url, imageDirectory, {
        alias: options.alias ? true : false,
        isRootFolderReferenced: options.isRootFolderReferenced ? true : false,
      });
      if (!imageGraph.has(filePath)) {
        imageGraph.set(filePath, {
          file: filePath,
          size: fs.statSync(filePath).size,
          hash: getFileHash(fs.readFileSync(filePath, 'utf8')),
          imports: new Set(),
          importedBy: new Set(),
          lastModified: fs.statSync(filePath).mtime.getTime(),
          isImage: false,
        });
      }
      importPath && imageGraph.get(filePath).imports.add(importPath);
      if (importPath && !imageGraph.has(importPath)) {
        imageGraph.set(importPath, {
          file: importPath,
          size: fs.statSync(importPath).size,
          hash: getFileHash(fs.readFileSync(importPath, 'utf8')),
          imports: new Set(),
          importedBy: new Set(),
          lastModified: fs.statSync(importPath).mtime.getTime(),
          isImage: true,
        });
      }
      importPath && imageGraph.get(importPath).importedBy.add(filePath);
    }
  }
}

async function getCssImages(directory = "src", createStepBar, imageDirectory, imageGraph, options, chalk) {
  const oldPaths = new Map();
  let numberOfCssFiles = 0;
  const cssFiles = await fg([
    `${directory}/**/*.{css,scss}`,
  ]);
  const scanBar = createStepBar(`1/${cssFiles.length}`, cssFiles.length, "Scanning CSS files", chalk);
  for (const file of cssFiles) {
    await new Promise(resolve => setTimeout(resolve, 50));
    scanBar.increment();
    const filePath = path.resolve(file);
    const css = fs.readFileSync(filePath, "utf-8");
    if(needsRebuild(filePath, css, imageGraph)) {
      // check if file is already in graph
      if(imageGraph.has(filePath)) {
        const oldFiles = imageGraph.get(filePath).imports;
        if(oldFiles.size > 0) {
          oldPaths.set(filePath, oldFiles);
        }
      }
      extractCssImages(css, filePath, imageDirectory, imageGraph, options);
      numberOfCssFiles++;
    }
  }
  scanBar.stop();
  let compareBar = null;
  if(oldPaths.size > 0) {
    compareBar = createStepBar(`1/${oldPaths.size}`, oldPaths.size, "Comparing CSS files with new paths", chalk);
  }
  // compare old paths with new paths
  for (const [filePath, oldFiles] of oldPaths) {
    if(compareBar) {
      await new Promise(resolve => setTimeout(resolve, 20));
      compareBar.increment();
    }
    if(imageGraph.has(filePath)) {
      const removedFiles = new Set([...oldFiles].filter(x => !imageGraph.get(filePath).imports.has(x)));
      if(removedFiles.size > 0) {
        removedFiles.forEach(file => {
          if(imageGraph.has(file)) {
            imageGraph.get(file).importedBy.delete(filePath);
          }
        });
      }
    }
  }
  if(compareBar) {
    compareBar.stop();
  }
  return numberOfCssFiles;
}

module.exports = {
  getCssImages,
};

