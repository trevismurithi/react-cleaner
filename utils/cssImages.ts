import fs from "fs";
import fg from "fast-glob";
import path from "path";
import type { ImageGraph, ChalkInstance, ScanOptions } from "../types";
import { needsRebuild } from "./cache";
import { resolveImageRef, type ImportResolver } from "./resolver";
import {
  createFileNodeInImageGraph,
  createImageNodeFromCssImport,
} from "./imageGraphUtils";

const URL_REGEX = /url\((['"]?)(.*?)\1\)/g;
const IMAGE_EXTENSION_REGEX = /\.(png|jpg|jpeg|svg|gif|webp|ico|avif)$/i;

/**
 * Extracts image URLs from CSS content using url() patterns
 */
function extractImageUrlsFromCss(cssContent: string): string[] {
  const imageUrls: string[] = [];
  const urlRegex = new RegExp(URL_REGEX);
  let match: RegExpExecArray | null;

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
 */
async function processCssImageUrl(
  url: string,
  filePath: string,
  projectRoot: string,
  imageGraph: ImageGraph,
  resolver: ImportResolver
): Promise<void> {
  const importPath = await resolveImageRef(url, filePath, projectRoot, resolver);
  if (!importPath) return;

  imageGraph.get(filePath)!.imports.add(importPath);
  createImageNodeFromCssImport(importPath, imageGraph);
  imageGraph.get(importPath)!.importedBy.add(filePath);
}

/**
 * Extracts CSS images and updates the image graph
 */
async function extractCssImages(
  cssContent: string,
  filePath: string,
  projectRoot: string,
  imageGraph: ImageGraph,
  resolver: ImportResolver
): Promise<void> {
  createFileNodeInImageGraph(filePath, cssContent, imageGraph);
  const imageUrls = extractImageUrlsFromCss(cssContent);

  for (const url of imageUrls) {
    await processCssImageUrl(url, filePath, projectRoot, imageGraph, resolver);
  }
}

/**
 * Scans CSS files and extracts image references
 */
async function scanCssFiles(
  cssFiles: string[],
  projectRoot: string,
  imageGraph: ImageGraph,
  resolver: ImportResolver
): Promise<Map<string, Set<string>>> {
  const oldPaths = new Map<string, Set<string>>();

  for (const file of cssFiles) {
    const filePath = path.resolve(file);
    const css = fs.readFileSync(filePath, "utf-8");
    const inNeededRebuild = needsRebuild(filePath, css, imageGraph);

    if (inNeededRebuild) {
      if (imageGraph.has(filePath)) {
        const oldFiles = new Set(imageGraph.get(filePath)!.imports);
        oldPaths.set(filePath, new Set(oldFiles));
      }
      await extractCssImages(css, filePath, projectRoot, imageGraph, resolver);
    }
  }
  return oldPaths;
}

/**
 * Compares old CSS import paths with new paths and updates the graph
 */
async function compareCssPaths(
  oldPaths: Map<string, Set<string>>,
  imageGraph: ImageGraph
): Promise<number> {
  let numberOfCssFiles = 0;

  for (const [filePath, oldFiles] of oldPaths) {
    const resolvedFilePath = path.resolve(filePath);
    if (imageGraph.has(resolvedFilePath)) {
      const removedFiles = new Set(
        [...oldFiles].filter(
          (x) => !imageGraph.get(resolvedFilePath)!.imports.has(x)
        )
      );
      if (removedFiles.size > 0) {
        removedFiles.forEach((file) => {
          if (imageGraph.has(file)) {
            imageGraph.get(file)!.importedBy.delete(resolvedFilePath);
          }
        });
      }
      numberOfCssFiles++;
    }
  }

  return numberOfCssFiles;
}

/**
 * Main function to get CSS images from a directory
 */
export async function getCssImages(
  directory = "src",
  projectRoot: string,
  imageGraph: ImageGraph,
  _options: ScanOptions,
  _chalk: ChalkInstance | unknown,
  resolver: ImportResolver
): Promise<number> {
  const cssFiles = await fg([`${directory}/**/*.{css,scss}`], {
    ignore: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/build/**"],
  });
  const oldPaths = await scanCssFiles(
    cssFiles,
    projectRoot,
    imageGraph,
    resolver
  );
  return compareCssPaths(oldPaths, imageGraph);
}
