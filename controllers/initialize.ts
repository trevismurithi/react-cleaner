import fs from "fs";
import path from "path";
import { globSync } from 'fast-glob';
import ts from "typescript";
import {
  DIRECTORIES_TO_EXCLUDE,
  EXTENSIONS_TO_EXCLUDE,
  NEXT_ENTRY_FILES,
  REACT_ENTRY_FILES,
} from "../utils/constants";
import type { Framework, PackageManager, QleanerConfig } from "../types";

interface TsConfigJson {
  extends?: string | string[];
  compilerOptions?: {
    paths?: Record<string, string[]>;
  };
  references?: Array<{ path?: string }>;
}

export interface InitOptions {
  force?: boolean;
  /** Project root to initialize (defaults to process.cwd()). */
  path?: string;
}

const GITIGNORE_SECTION_HEADER = "# Qleaner";
const CACHE_FILE_GITIGNORE_ENTRY = "unused-check-cache.json";
const TRASH_DIR_GITIGNORE_ENTRY = ".trash/";

/**
 * Appends Qleaner-related ignore rules to `.gitignore` when they are missing.
 * @param projectRoot - Absolute path to the project (typically `process.cwd()`).
 */
function appendQleanerGitignoreEntries(projectRoot: string): void {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  const rawGitignore = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf8")
    : "";
  const gitignoreLines = rawGitignore.split(/\r?\n/);
  const trimmedLines = gitignoreLines.map((line) => line.trim());

  const cacheFileAlreadyIgnored = trimmedLines.some((trimmedLine) => {
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return false;
    }
    return (
      trimmedLine === CACHE_FILE_GITIGNORE_ENTRY ||
      trimmedLine.endsWith(`/${CACHE_FILE_GITIGNORE_ENTRY}`)
    );
  });

  const trashDirAlreadyIgnored = trimmedLines.some((trimmedLine) => {
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return false;
    }
    return (
      trimmedLine === ".trash" ||
      trimmedLine === TRASH_DIR_GITIGNORE_ENTRY ||
      trimmedLine.startsWith(".trash/")
    );
  });

  const ignoreLinesToAppend: string[] = [];
  if (!cacheFileAlreadyIgnored) {
    ignoreLinesToAppend.push(CACHE_FILE_GITIGNORE_ENTRY);
  }
  if (!trashDirAlreadyIgnored) {
    ignoreLinesToAppend.push(TRASH_DIR_GITIGNORE_ENTRY);
  }
  if (ignoreLinesToAppend.length === 0) {
    return;
  }

  let updatedGitignore = rawGitignore;
  if (updatedGitignore.length > 0 && !updatedGitignore.endsWith("\n")) {
    updatedGitignore += "\n";
  }
  if (updatedGitignore.length > 0 && !updatedGitignore.endsWith("\n\n")) {
    updatedGitignore += "\n";
  }
  updatedGitignore += `${GITIGNORE_SECTION_HEADER}\n${ignoreLinesToAppend.join("\n")}\n`;
  fs.writeFileSync(gitignorePath, updatedGitignore, "utf8");
}

function detectPackageManager(projectRoot: string): PackageManager {
  if (fs.existsSync(path.join(projectRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(projectRoot, "yarn.lock"))) return "yarn";
  return "npm";
}

function frameworkBasenameExcludes(framework: Framework): string[] {
  if (framework === "nextjs") return [...NEXT_ENTRY_FILES];
  if (framework === "remix") {
    return [...new Set([...NEXT_ENTRY_FILES, ...REACT_ENTRY_FILES, "routes.ts", "routes.js"])];
  }
  if (framework === "vue" || framework === "nuxt" || framework === "svelte") {
    return [];
  }
  return [...REACT_ENTRY_FILES];
}

function frameworkDirPrint(framework: Framework): string[] {
  if (framework === "vue" || framework === "nuxt") return ["layouts", "pages"];
  if (framework === "svelte") return ["routes"];
  return [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Zero-prompt init: detect project settings and write qleaner.config.json.
 */
export async function init(options: InitOptions = {}): Promise<void> {
  const projectRoot = path.resolve(options.path || process.cwd());

  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    console.error(`Project path does not exist or is not a directory: ${projectRoot}`);
    process.exitCode = 1;
    return;
  }

  const configFilePath = path.join(projectRoot, "qleaner.config.json");

  if (fs.existsSync(configFilePath) && !options.force) {
    console.error(
      `qleaner.config.json already exists at ${configFilePath}. Re-run with --force to overwrite.`
    );
    process.exitCode = 1;
    return;
  }

  const framework = autoDetectFramework(projectRoot);
  const codeAlias = autoDiscoverCodeAlias(projectRoot);
  const paths = codeAlias
    ? resolveTsConfigPaths(path.join(projectRoot, codeAlias))
    : {};
  const packageManager = detectPackageManager(projectRoot);
  const discoveredEntries = collectProjectEntryPoints(projectRoot, framework);
  const excludeFilePrint = uniqueStrings([
    ...frameworkBasenameExcludes(framework),
    ...discoveredEntries,
  ]);
  const excludeDirPrint = frameworkDirPrint(framework);

  const config: QleanerConfig = {
    framework,
    codeAlias,
    paths,
    packageManager,
    excludeDir: DIRECTORIES_TO_EXCLUDE,
    excludeFile: ["payload-types.ts", "payload-types.js"],
    excludeExtensions: EXTENSIONS_TO_EXCLUDE,
    excludeDirPrint,
    excludeFilePrint,
    excludeDirAssets: DIRECTORIES_TO_EXCLUDE,
    excludeFileAssets: [],
    excludeDirCode: DIRECTORIES_TO_EXCLUDE,
    excludeFileCode: [],
  };

  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
  appendQleanerGitignoreEntries(projectRoot);

  console.log("Wrote qleaner.config.json");
  console.log(`  framework:       ${framework}`);
  console.log(`  codeAlias:       ${codeAlias ?? "(none)"}`);
  console.log(`  path aliases:    ${Object.keys(paths).length}`);
  console.log(`  packageManager:  ${packageManager}`);
  console.log(`  entry excludes:  ${excludeFilePrint.length}`);
  console.log(`  dir excludes:    ${excludeDirPrint.join(", ") || "(none)"}`);
  console.log(`  path:            ${configFilePath}`);
  console.log("Edit qleaner.config.json to add any missing excludes.");
}


export function autoDetectFramework(projectRoot = process.cwd()): Framework {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return 'vanilla';

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps['next']) return 'nextjs';
    if (deps['nuxt']) return 'nuxt';
    if (deps['@remix-run/react'] || deps['@react-router/dev']) return 'remix';
    if (deps['vue']) return 'vue';
    if (deps['react']) return 'react';
    if (deps['svelte'] || deps['@sveltejs/kit']) return 'svelte';

    return 'vanilla';
  } catch {
    return 'vanilla';
  }
}

/**
 * Reads a tsconfig/jsconfig via TypeScript's JSONC parser (comments + trailing commas).
 */
function readTsConfigJson(configPath: string): TsConfigJson | null {
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error || config == null) return null;
  return config as TsConfigJson;
}

/**
 * Recursively inspects a tsconfig file, following `extends` and `references`
 * to collect all `compilerOptions.paths` mappings across the project.
 */
export function resolveTsConfigPaths(
  configPath: string,
  visited = new Set<string>()
): Record<string, string[]> {
  const absolutePath = path.resolve(configPath);

  // Prevent infinite loops on circular references or duplicate imports
  if (visited.has(absolutePath) || !fs.existsSync(absolutePath)) {
    return {};
  }
  visited.add(absolutePath);

  const config = readTsConfigJson(absolutePath);
  if (!config) {
    return {};
  }

  let aggregatedPaths: Record<string, string[]> = {};
  const configDir = path.dirname(absolutePath);

  // 1. Traverse `extends` (e.g., "extends": "./tsconfig.base.json")
  if (config.extends) {
    const extendsList = Array.isArray(config.extends) ? config.extends : [config.extends];
    for (const extPath of extendsList) {
      let resolvedExt = path.resolve(configDir, extPath);
      if (!resolvedExt.endsWith('.json')) resolvedExt += '.json';

      const parentPaths = resolveTsConfigPaths(resolvedExt, visited);
      aggregatedPaths = { ...aggregatedPaths, ...parentPaths };
    }
  }

  // 2. Collect `compilerOptions.paths` from current config file
  if (config.compilerOptions?.paths) {
    aggregatedPaths = { ...aggregatedPaths, ...config.compilerOptions.paths };
  }

  // 3. Traverse `references` (e.g., { "path": "./tsconfig.app.json" })
  if (Array.isArray(config.references)) {
    for (const ref of config.references) {
      if (!ref.path) continue;

      let refPath = path.resolve(configDir, ref.path);

      // If ref.path points to a directory, look for tsconfig.json inside it
      if (fs.existsSync(refPath) && fs.statSync(refPath).isDirectory()) {
        refPath = path.join(refPath, 'tsconfig.json');
      } else if (!refPath.endsWith('.json')) {
        refPath += '.json';
      }

      const childPaths = resolveTsConfigPaths(refPath, visited);
      aggregatedPaths = { ...aggregatedPaths, ...childPaths };
    }
  }

  return aggregatedPaths;
}

export function autoDiscoverCodeAlias(projectRoot = process.cwd()) {
  // Order matters: check app-specific tsconfigs first, then base, then jsconfig
  const candidateConfigs = [
    'tsconfig.json',
    'jsconfig.json',
  ];

  for (const configFileName of candidateConfigs) {
    const fullPath = path.join(projectRoot, configFileName);
    if (fs.existsSync(fullPath)) {
      return configFileName; // Return the first one found automatically
    }
  }

  return null; // No path alias config found
}

const NEXT_APP_SPECIAL_FILES =
  '{page,layout,route,template,error,loading,not-found,global-error,default}.{js,jsx,ts,tsx}';
const SOURCE_EXPORT_RE = /\.(m?[jt]sx?|vue|svelte)$/;
const GLOB_IGNORE = ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/build/**'];

const FRAMEWORK_ROUTE_GLOBS: Record<Framework, string[]> = {
  nextjs: [
    `app/**/${NEXT_APP_SPECIAL_FILES}`,
    `src/app/**/${NEXT_APP_SPECIAL_FILES}`,
    'pages/**/*.{js,jsx,ts,tsx}',
    'src/pages/**/*.{js,jsx,ts,tsx}',
    'middleware.{js,ts}',
    'src/middleware.{js,ts}',
    'instrumentation.{js,ts}',
    'src/instrumentation.{js,ts}',
    'app/**/{sitemap,robots,manifest}.{js,ts}',
    'src/app/**/{sitemap,robots,manifest}.{js,ts}',
  ],
  nuxt: [
    'pages/**/*.{vue,ts,js}',
    'layouts/**/*.{vue,ts,js}',
    'middleware/**/*.{vue,ts,js}',
    'app.vue',
    'error.vue',
    'src/pages/**/*.{vue,ts,js}',
    'src/layouts/**/*.{vue,ts,js}',
    'src/middleware/**/*.{vue,ts,js}',
    'src/app.vue',
    'src/error.vue',
  ],
  remix: [
    'app/root.{js,jsx,ts,tsx}',
    'app/routes.{js,jsx,ts,tsx}',
    'app/routes/**/*.{js,jsx,ts,tsx}',
    'app/entry.client.{js,jsx,ts,tsx}',
    'app/entry.server.{js,jsx,ts,tsx}',
    `app/**/${NEXT_APP_SPECIAL_FILES}`,
  ],
  vue: [
    'src/{main,App}.{js,ts,vue}',
    'src/pages/**/*.vue',
    'src/layouts/**/*.vue',
  ],
  react: [
    'src/{main,index,App}.{js,jsx,ts,tsx}',
    'src/pages/**/{route,layout,index,root}.{js,jsx,ts,tsx}',
    'src/layouts/**/*.{js,jsx,ts,tsx}',
  ],
  svelte: [
    'src/routes/**/+{page,layout,error,server,page.server}.{svelte,ts,js}',
  ],
  vanilla: [],
};

export function collectProjectEntryPoints(
  projectRoot: string,
  framework: Framework
): string[] {
  const entries = new Set<string>();

  // 1. Check HTML Files (Vite / CRA / SPAs)
  const htmlFiles = globSync(['index.html', '**/index.html', '*.html'], {
    cwd: projectRoot,
    absolute: true,
    ignore: GLOB_IGNORE,
  });
  for (const htmlPath of htmlFiles) {
    const content = fs.readFileSync(htmlPath, 'utf-8');
    const scriptMatches = content.matchAll(/<script[^>]+src=["']([^"']+)["']/g);
    for (const match of scriptMatches) {
      let scriptSrc = match[1];
      if (scriptSrc.startsWith('/')) scriptSrc = scriptSrc.slice(1);
      entries.add(path.normalize(scriptSrc));
    }
  }

  // 2. Universal SPA bootstrap fallback (covers HTML-less packages)
  const spaBoots = globSync('src/{main,index,App}.{js,jsx,ts,tsx,vue}', {
    cwd: projectRoot,
    ignore: GLOB_IGNORE,
  });
  spaBoots.forEach((file) => entries.add(path.normalize(file)));

  // 3. Check package.json (Libraries / Node Apps)
  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const addSourceExport = (value: unknown) => {
      if (typeof value !== 'string') return;
      if (!SOURCE_EXPORT_RE.test(value)) return;
      entries.add(path.normalize(value));
    };

    ['main', 'module', 'browser'].forEach((key) => {
      addSourceExport(pkg[key]);
    });

    if (pkg.exports) {
      const extractExports = (obj: unknown) => {
        if (typeof obj === 'string') addSourceExport(obj);
        else if (typeof obj === 'object' && obj !== null) {
          Object.values(obj).forEach(extractExports);
        }
      };
      extractExports(pkg.exports);
    }
  }

  // 4. Add Framework Route Globs
  const routeGlobs = FRAMEWORK_ROUTE_GLOBS[framework];
  if (routeGlobs.length > 0) {
    const routeFiles = globSync(routeGlobs, {
      cwd: projectRoot,
      ignore: GLOB_IGNORE,
    });
    routeFiles.forEach((file) => entries.add(path.normalize(file)));
  }

  return Array.from(entries);
}