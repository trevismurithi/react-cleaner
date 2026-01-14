/**
 * Builds an array of glob patterns for file discovery, including exclusion patterns
 * @param {string} directory - The base directory to search
 * @param {Object} options - Options object containing exclusion patterns
 * @returns {Array<string>} Array of glob patterns
 */
function buildContentPaths(directory, options) {
  const contentPaths = [`${directory}/**/*.{tsx,ts,js,jsx}`];
  
  if (options.excludeDir && options.excludeDir.length > 0) {
    options.excludeDir.forEach((dir) => {
      contentPaths.push(`!${dir}/**`);
    });
  }
  
  if (options.excludeFile && options.excludeFile.length > 0) {
    options.excludeFile.forEach((file) => {
      contentPaths.push(`!${directory}/**/${file}`);
    });
  }
  
  if (options.excludeExtensions && options.excludeExtensions.length > 0) {
    options.excludeExtensions.forEach((extension) => {
      contentPaths.push(`!${directory}/**/*.${extension}`);
    });
  }
  
  return contentPaths;
}

module.exports = {
  buildContentPaths,
};
