const fs = require('fs');
const fg = require('fast-glob');
const path = require('path');
const { getFileHash } = require('./cache');
const { normalize } = require('./resolver');

function extractCssImages(cssContent, file, imageDirectory, imageGraph, options) {
  const urlRegex = /url\((['"]?)(.*?)\1\)/g;
  let match;

  while ((match = urlRegex.exec(cssContent)) !== null) {
    const url = match[2];

    // Only collect image file types
    if (/\.(png|jpg|jpeg|svg|gif|webp)$/i.test(url)) {
      const filePath = path.resolve(file);
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
        });
      }
      imageGraph.get(filePath).imports.add(importPath);
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
      imageGraph.get(importPath).importedBy.add(filePath);
    }
  }
}

async function getCssImages(directory = "src", createStepBar, imageDirectory, imageGraph, options, chalk) {
  const cssFiles = await fg([
    `${directory}/**/*.{css,scss}`,
  ]);
  const scanBar = createStepBar(`1/${cssFiles.length}`, cssFiles.length, "Scanning CSS files", chalk);
  for (const file of cssFiles) {
    await new Promise(resolve => setTimeout(resolve, 50));
    scanBar.increment();
    const css = fs.readFileSync(file, "utf-8");
    extractCssImages(css, file, imageDirectory, imageGraph, options);
  }
  scanBar.stop();
}

module.exports = {
  getCssImages,
};

