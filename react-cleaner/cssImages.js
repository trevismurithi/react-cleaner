const fs = require('fs');
const fg = require('fast-glob');

function extractCssImages(cssContent) {
  const urlRegex = /url\((['"]?)(.*?)\1\)/g;
  const images = new Set();
  let match;

  while ((match = urlRegex.exec(cssContent)) !== null) {
    const url = match[2];

    // Only collect image file types
    if (/\.(png|jpg|jpeg|svg|gif|webp)$/i.test(url)) {
      images.add(url);
    }
  }

  return Array.from(images);
}

async function getCssImages() {
  const cssFiles = await fg([
    "src/**/*.{css,scss}",
  ]);
  for (const file of cssFiles) {
    const css = fs.readFileSync(file, "utf-8");
    const images = extractCssImages(css);
    console.log(images);
  }
}

getCssImages();

