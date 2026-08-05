import fg from "fast-glob";
import fs from "fs";
import path from "path";
import { parseCode } from "../utils/astParser";
import traverse from "@babel/traverse";
import { getCssImages } from "../utils/cssImages";
import { logStage, timed } from "../utils/utils";
import { initializeCache } from "../command";
import { needsRebuild, getFileHash, saveCache } from "../utils/cache";
import {
  resolveImageRef,
  createResolver,
  type ImportResolver,
} from "../utils/resolver";
import { buildImagePaths, buildCodePaths } from "../utils/imagePathBuilder";
import { createASTTraverser } from "../utils/imageAstParser";
import { addToImageGraph } from "../utils/imageGraphUtils";
import {
  displayUnusedImages,
  handleImageDeletion,
} from "../utils/imageDisplay";
import { parse } from "@vue/compiler-sfc";
import { resolveScanPathConfig } from "./list";
import type {
  ChalkInstance,
  ImageGraph,
  ImageParentGraph,
  QleanerConfig,
  ScanOptions,
} from "../types";
import type { ImageImportRef } from "../utils/imageExtractors";

interface ImageScanOptions extends ScanOptions {
  hideNotFoundImages?: boolean;
}

interface UnusedImageEntry {
  file: string;
  size: number;
  isImage?: boolean;
  deadLink?: boolean;
}

function loadImageConfig(
  projectRoot: string,
  options: ImageScanOptions
): ImageScanOptions {
  const candidates = [
    path.join(projectRoot, "qleaner.config.json"),
    path.join(process.cwd(), "qleaner.config.json"),
  ];
  for (const configPath of candidates) {
    if (!fs.existsSync(configPath)) continue;
    const config = JSON.parse(
      fs.readFileSync(configPath, "utf8")
    ) as QleanerConfig;
    return {
      ...config,
      ...options,
    };
  }
  return options;
}

/**
 * Creates a file node in the image graph for a code file
 */
function createCodeFileNode(filePath: string, imageGraph: ImageGraph): void {
  imageGraph.set(filePath, {
    file: filePath,
    size: fs.statSync(filePath).size,
    hash: getFileHash(fs.readFileSync(filePath, "utf8")),
    imports: new Set(),
    importedBy: new Set(),
    isImage: false,
    lastModified: fs.statSync(filePath).mtime.getTime(),
  });
}

/**
 * Processes a single import and adds it to the image graph
 */
async function processImageImport(
  importInfo: ImageImportRef,
  projectRoot: string,
  imageGraph: ImageGraph,
  resolver: ImportResolver
): Promise<void> {
  const filePath = path.resolve(importInfo.file);
  const source = importInfo.source?.trim() ?? "";
  if (
    !source ||
    /^https?:\/\//i.test(source) ||
    source.startsWith("data:")
  ) {
    return;
  }

  const resolved = await resolveImageRef(
    source,
    importInfo.file,
    projectRoot,
    resolver
  );

  // Unresolved refs become dead-link candidates (size 0) for hideNotFoundImages
  const importPath =
    resolved ??
    path.resolve(projectRoot, source.replace(/^[@~]\//, "").replace(/^\//, ""));

  addToImageGraph(importPath, imageGraph);
  imageGraph.get(importPath)!.importedBy.add(filePath);
  imageGraph.get(filePath)!.imports.add(importPath);
}

/**
 * Processes all collected image imports
 */
async function processImageImports(
  imports: ImageImportRef[],
  projectRoot: string,
  imageGraph: ImageGraph,
  resolver: ImportResolver
): Promise<void> {
  for (const importInfo of imports) {
    await processImageImport(importInfo, projectRoot, imageGraph, resolver);
  }
}

/**
 * Compares old import paths with new paths and updates the graph
 */
async function compareCodePaths(
  oldPaths: Map<string, Set<string>>,
  imageGraph: ImageGraph
): Promise<number> {
  let removedFilesCount = 0;

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
      removedFilesCount++;
    }
  }

  return removedFilesCount;
}

/**
 * Scan code files and extract all image references
 */
async function scanCodeFilesForImages(
  codeFiles: string[],
  projectRoot: string,
  imageGraph: ImageGraph,
  options: ImageScanOptions,
  resolver: ImportResolver
): Promise<number> {
  const imports: ImageImportRef[] = [];
  const oldPaths = new Map<string, Set<string>>();

  for (const file of codeFiles) {
    const filePath = path.resolve(file);
    const code = fs.readFileSync(filePath, "utf8");

    if (needsRebuild(filePath, code, imageGraph)) {
      const extension = path.extname(filePath);
      let ast: ReturnType<typeof parseCode> | null = null;
      if (extension === ".vue") {
        const { descriptor } = parse(code);
        if (descriptor.scriptSetup || descriptor.script) {
          const vueScriptLang =
            descriptor.scriptSetup?.lang || descriptor.script?.lang || "";
          ast = parseCode(
            descriptor.scriptSetup?.content || descriptor.script?.content || "",
            filePath,
            vueScriptLang
          );
        }
      } else {
        ast = parseCode(code, filePath);
      }
      if (imageGraph.has(filePath)) {
        const oldFiles = new Set(imageGraph.get(filePath)!.imports);
        oldPaths.set(filePath, new Set(oldFiles));
      }
      createCodeFileNode(filePath, imageGraph);
      const traverser = createASTTraverser(filePath, imports);
      traverse(ast as any, traverser);
    }
  }

  await processImageImports(imports, projectRoot, imageGraph, resolver);
  const removedFilesCount = await compareCodePaths(oldPaths, imageGraph);
  const numberOfCssFiles = await getCssImages(
    projectRoot,
    projectRoot,
    imageGraph,
    options,
    undefined,
    resolver
  );

  return imports.length || removedFilesCount || numberOfCssFiles;
}

/**
 * Find unused images by comparing image files with normalized used images
 */
function findUnusedImages(
  imageParentGraph: ImageParentGraph & {
    unusedImages: Set<UnusedImageEntry>;
  },
  imageFiles: string[],
  options: ImageScanOptions
): Set<UnusedImageEntry> {
  for (const imageFile of imageFiles) {
    const filePath = path.resolve(imageFile);
    const image = imageParentGraph.imageGraph.get(filePath);
    if (!image) {
      imageParentGraph.unusedImages.add({
        file: filePath,
        size: fs.statSync(imageFile).size,
        isImage: true,
      });
    } else if (image && image.importedBy.size === 0 && image.isImage) {
      imageParentGraph.unusedImages.add({
        file: filePath,
        size: fs.statSync(imageFile).size,
        isImage: image.isImage,
      });
    }
  }
  if (options.hideNotFoundImages) {
    return imageParentGraph.unusedImages;
  }
  for (const [, image] of imageParentGraph.imageGraph) {
    if (image.size === 0 && image.isImage) {
      imageParentGraph.unusedImages.add({
        file: image.file,
        size: image.size,
        isImage: image.isImage,
        deadLink: true,
      });
    }
  }

  return imageParentGraph.unusedImages;
}

/**
 * MAIN FUNCTION
 * @param projectPath - Project root for image inventory and code scan (defaults to cwd)
 */
export async function getUnusedImages(
  chalk: ChalkInstance,
  projectPath: string = process.cwd(),
  options: ImageScanOptions = {}
): Promise<void> {
  const projectRoot = path.resolve(projectPath || process.cwd());
  options = loadImageConfig(projectRoot, options);

  logStage(chalk, "Start Qleaner image scan");
  const { options: mergedOpts, pathConfig } = resolveScanPathConfig(
    projectRoot,
    options,
    chalk
  );
  const resolver = createResolver(
    projectRoot,
    pathConfig as Record<string, string[]>
  );

  const imagePaths = buildImagePaths(projectRoot, mergedOpts);
  const codePaths = buildCodePaths(projectRoot, mergedOpts);

  const discovered = await timed(
    "Discovering image & code files",
    async () => ({
      imageFiles: await fg(imagePaths),
      codeFiles: await fg(codePaths),
    }),
    chalk
  );
  const imageFiles = discovered.imageFiles;
  const codeFiles = discovered.codeFiles;
  logStage(
    chalk,
    `Found ${imageFiles.length} image files and ${codeFiles.length} code files`,
    "info"
  );

  const { parentGraph, imageParentGraph } = initializeCache(
    mergedOpts,
    chalk,
    false
  );

  const numberOfCodeFiles = await timed(
    "Scanning code files for image references",
    () =>
      scanCodeFilesForImages(
        codeFiles,
        projectRoot,
        imageParentGraph.imageGraph,
        mergedOpts as ImageScanOptions,
        resolver
      ),
    chalk
  );

  const typedImageParentGraph = imageParentGraph as ImageParentGraph & {
    unusedImages: Set<UnusedImageEntry>;
  };

  if (typedImageParentGraph.unusedImages.size === 0 || numberOfCodeFiles > 0) {
    typedImageParentGraph.unusedImages = new Set();
    findUnusedImages(
      typedImageParentGraph,
      imageFiles,
      mergedOpts as ImageScanOptions
    );
  }

  logStage(
    chalk,
    `Found ${typedImageParentGraph.unusedImages.size} unused images`,
    "done"
  );
  displayUnusedImages(
    typedImageParentGraph.unusedImages as any,
    mergedOpts as any,
    chalk
  );

  saveCache(projectRoot, { parentGraph, imageParentGraph }, false);
  typedImageParentGraph.unusedImages = new Set(
    [...typedImageParentGraph.unusedImages].filter((image) => !image.deadLink)
  );
  await handleImageDeletion(
    typedImageParentGraph.unusedImages as any,
    mergedOpts as any,
    chalk
  );
  logStage(chalk, "Completed Qleaner image scan", "done");
}
