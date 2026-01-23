/**
 * Build glob patterns for image files with exclusions
 * @param {string} imageDirectory - The base directory for images
 * @param {Object} options - Options object containing exclusion patterns
 * @returns {Array<string>} Array of glob patterns for image files
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
 * @param {string} codeDirectory - The base directory for code files
 * @param {Object} options - Options object containing exclusion patterns
 * @returns {Array<string>} Array of glob patterns for code files
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

module.exports = {
  buildImagePaths,
  buildCodePaths,
};
