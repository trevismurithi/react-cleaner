import type { ScanOptions } from "../types";

/**
 * Builds an array of glob patterns for file discovery, including exclusion patterns
 * @param directory - The base directory to search
 * @param options - Options object containing exclusion patterns
 * @returns Array of glob patterns
 */
export function buildContentPaths(
  directory: string,
  options: ScanOptions
): string[] {
  let contentPaths: string[] = [];
  if (options.framework === "vue") {
    contentPaths = [`${directory}/**/*.{ts,js,jsx,vue}`];
  } else {
    contentPaths = [`${directory}/**/*.{tsx,ts,js,jsx}`];
  }

  if (options.excludeDir && options.excludeDir.length > 0) {
    options.excludeDir.forEach((dir) => {
      contentPaths.push(`!${directory}/**/${dir}/**`);
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
