const path = require("path");
const { create } = require("enhanced-resolve");
const { URL_EXTRACT_REGEX } = require("./constants");

function createResolver(directory) {
  const resolver = create({
    extensions: [".js", ".jsx", ".ts", ".tsx"],
    alias: {
      "@": path.resolve(directory),
      "~": path.resolve(directory),
    },
    mainFiles: ["index"],
    // Where resolution begins
    modules: [path.resolve(directory)],
  });

  return function resolveImport(sourceFile, importPath) {
    // console.log(chalk.yellow('sourceFile--resolver'), sourceFile, chalk.yellow('importPath--resolver'), importPath);
    return new Promise((resolve, _) => {
      resolver(path.dirname(sourceFile), importPath, (err, result) => {
        if (err) return resolve(null);
        resolve(path.resolve(result));
      });
    });
  };
}

/**
 * Normalize image paths for consistent matching.
 */
function normalize(
  value,
  imageDirectory,
  { alias = true, isRootFolderReferenced = false }
) {
  if (!value) return null;

  // Return null if value is a URL (http:// or https://)
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return null;
  }

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

module.exports = {
  createResolver,
  normalize,
};
