import { DIRECTORIES_TO_EXCLUDE } from "./constants";
import type { ScanOptions } from "../types";

const IMAGE_EXTENSIONS = "png,jpg,jpeg,svg,gif,webp,ico,avif";

function uniqueDirs(dirs: string[]): string[] {
  return [...new Set(dirs.filter(Boolean))];
}

/**
 * Build glob patterns for image files with exclusions
 * @param imageDirectory - The base directory for images
 * @param options - Options object containing exclusion patterns
 * @returns Array of glob patterns for image files
 */
export function buildImagePaths(
  imageDirectory: string,
  options: ScanOptions
): string[] {
  const imagePaths = [`${imageDirectory}/**/*.{${IMAGE_EXTENSIONS}}`];

  const dirsToExclude = uniqueDirs([
    ...DIRECTORIES_TO_EXCLUDE,
    ".trash",
    ...(options.excludeDirAssets ?? []),
    ...(options.excludeDir ?? []),
  ]);

  dirsToExclude.forEach((dir) => {
    imagePaths.push(`!${imageDirectory}/**/${dir}/**`);
    imagePaths.push(`!${imageDirectory}/${dir}/**`);
  });

  if (options.excludeFileAssets && options.excludeFileAssets.length > 0) {
    options.excludeFileAssets.forEach((file) => {
      imagePaths.push(`!${imageDirectory}/**/${file}`);
    });
  }

  return imagePaths;
}

/**
 * Build glob patterns for code files with exclusions
 * @param codeDirectory - The base directory for code files
 * @param options - Options object containing exclusion patterns
 * @returns Array of glob patterns for code files
 */
export function buildCodePaths(
  codeDirectory: string,
  options: ScanOptions
): string[] {
  let codePaths: string[] = [];
  if (options.framework === "vue") {
    codePaths = [`${codeDirectory}/**/*.{js,jsx,ts,vue}`];
  } else {
    codePaths = [`${codeDirectory}/**/*.{js,jsx,ts,tsx}`];
  }
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
