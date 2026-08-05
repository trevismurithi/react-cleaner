import path from "path";
import fs from "fs";
import { create } from "enhanced-resolve";
import { URL_EXTRACT_REGEX } from "./constants";

export interface ResolveImportResult {
  importPath: string;
  isMightBeModule: boolean;
}

export type ImportResolver = (
  sourceFile: string,
  importPath: string
) => Promise<ResolveImportResult>;

export interface NormalizeOptions {
  alias?: boolean;
  isRootFolderReferenced?: boolean;
}

function resolveImportPath(basePath: string): string | null {
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

  // 1. Exact file
  for (const ext of extensions) {
    if (fs.existsSync(basePath + ext)) {
      return basePath + ext;
    }
  }

  // 2. Directory index
  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    for (const ext of extensions) {
      const indexFile = path.join(basePath, `index${ext}`);
      if (fs.existsSync(indexFile)) {
        return indexFile;
      }
    }
  }

  return null;
}

export function createResolver(
  directory: string,
  pathConfig: Record<string, string[]> = {}
): ImportResolver {
  let alias: Record<string, string> = {};
  if (Object.entries(pathConfig).length > 0) {
    for (const [key, value] of Object.entries(pathConfig)) {
      for (const pathItem of value) {
        const cleanKey = key.replace(/\/\*$/, "");
        const cleanPathItem = pathItem.replace(/\/\*$/, "");
        alias[cleanKey] = path.resolve(directory, cleanPathItem);
      }
    }
  } else {
    alias = {
      "@": path.resolve(directory),
      "~": path.resolve(directory),
    };
  }

  const sortedAlias = Object.fromEntries(
    Object.entries(alias).sort(([a], [b]) => b.length - a.length)
  );

  const resolver = create({
    extensions: [
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".png",
      ".jpg",
      ".jpeg",
      ".svg",
      ".gif",
      ".webp",
      ".ico",
      ".avif",
    ],
    alias: sortedAlias,
    mainFiles: ["index"],
    // Where resolution begins
    modules: [path.resolve(directory)],
  });

  return function resolveImport(
    sourceFile: string,
    importPath: string
  ): Promise<ResolveImportResult> {
    return new Promise((resolve) => {
      resolver(path.dirname(sourceFile), importPath, (err, result) => {
        if (err) return resolve({ importPath, isMightBeModule: true });
        const pathToResolve = path.resolve(result as string);
        if (
          fs.existsSync(pathToResolve) &&
          fs.statSync(pathToResolve).isDirectory()
        ) {
          const indexFile = resolveImportPath(pathToResolve);
          if (indexFile) {
            return resolve({ importPath: indexFile, isMightBeModule: false });
          }
        }
        resolve({
          importPath: path.resolve(result as string),
          isMightBeModule: false,
        });
      });
    });
  };
}

const PUBLIC_URL_ROOTS = ["public", "static", ""];
const ALIAS_STRIP_ROOTS = ["", "public", "static", "assets", "src/assets", "src"];

function existingFile(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const resolved = path.resolve(candidate);
  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Resolve an image reference from code/CSS to an on-disk file using multiple strategies.
 */
export async function resolveImageRef(
  raw: string | null | undefined,
  issuerFile: string,
  projectRoot: string,
  resolver: ImportResolver
): Promise<string | null> {
  if (!raw) return null;

  let value = raw.trim();
  if (
    !value ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:")
  ) {
    return null;
  }

  const urlMatch = [...value.matchAll(URL_EXTRACT_REGEX)];
  if (urlMatch.length > 0) {
    value = urlMatch[0][2];
  }
  value = value.split("?")[0].split("#")[0];
  if (!value) return null;

  // 1. Module / tsconfig-alias resolve
  const { importPath, isMightBeModule } = await resolver(issuerFile, value);
  if (!isMightBeModule) {
    const fromModule = existingFile(importPath);
    if (fromModule) return fromModule;
  }

  // 2. Relative to the issuing file
  if (value.startsWith("./") || value.startsWith("../")) {
    const fromRelative = existingFile(
      path.resolve(path.dirname(issuerFile), value)
    );
    if (fromRelative) return fromRelative;
  } else if (!value.startsWith("/") && !value.startsWith("@") && !value.startsWith("~")) {
    const fromRelative = existingFile(
      path.resolve(path.dirname(issuerFile), value)
    );
    if (fromRelative) return fromRelative;
  }

  // 3. Public URL: /img/a.png → public/img/a.png, static/..., project root
  if (value.startsWith("/")) {
    const stripped = value.slice(1);
    for (const root of PUBLIC_URL_ROOTS) {
      const candidate = root
        ? path.join(projectRoot, root, stripped)
        : path.join(projectRoot, stripped);
      const hit = existingFile(candidate);
      if (hit) return hit;
    }
  }

  // 4. Alias-strip fallback: @/assets/x.png → <root>/assets/x.png, etc.
  const strippedAlias = value.replace(/^[@~]\//, "").replace(/^\/+/, "");
  if (strippedAlias) {
    for (const root of ALIAS_STRIP_ROOTS) {
      const candidate = root
        ? path.join(projectRoot, root, strippedAlias)
        : path.join(projectRoot, strippedAlias);
      const hit = existingFile(candidate);
      if (hit) return hit;
    }
  }

  return null;
}

/**
 * @deprecated Prefer resolveImageRef. Kept for any external callers.
 */
export function normalize(
  value: string | null | undefined,
  imageDirectory: string,
  { alias = true, isRootFolderReferenced = false }: NormalizeOptions
): string | null {
  if (!value) return null;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return null;
  }

  const match = [...value.matchAll(URL_EXTRACT_REGEX)];
  if (match.length > 0) {
    value = match[0][2];
  }

  value = value.split("?")[0];

  if (value.startsWith("/") && !isRootFolderReferenced) {
    return path.resolve(path.join(imageDirectory, value.slice(1)));
  }

  if (alias) {
    return path.resolve(path.join(imageDirectory, value));
  }

  const logicalPath = value
    .replace(/^[@~]\//, "")
    .replace(/^(\.{1,2}\/)+/, "")
    .replace(/^\/+/, "");

  const pathItems = logicalPath.split(path.sep);

  if (isRootFolderReferenced) {
    pathItems.splice(0, 1);
  }

  const resultPath = pathItems.join(path.sep);
  return path.resolve(imageDirectory, resultPath);
}
