const fs = require('fs');
const fg = require('fast-glob');
const path = require('path');

function extractCssImages(cssContent, images, file) {
  const urlRegex = /url\((['"]?)(.*?)\1\)/g;
  let match;

  while ((match = urlRegex.exec(cssContent)) !== null) {
    const url = match[2];

    // Only collect image file types
    if (/\.(png|jpg|jpeg|svg|gif|webp)$/i.test(url)) {
      images.push({
        value: url,
        file: path.resolve(file),
      });
    }
  }
  return images
}

async function getCssImages(directory = "src") {
  const cssFiles = await fg([
    `${directory}/**/*.{css,scss}`,
  ]);
  let images = [];
  for (const file of cssFiles) {
    const css = fs.readFileSync(file, "utf-8");
    images = extractCssImages(css, images, file);
  }
  return images;
}

module.exports = {
  getCssImages,
};

