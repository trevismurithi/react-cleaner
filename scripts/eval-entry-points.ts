import path from "path";
import { globSync } from "fast-glob";
import {
  autoDetectFramework,
  autoDiscoverCodeAlias,
  collectProjectEntryPoints,
  resolveTsConfigPaths,
} from "../controllers/initialize";
import { NEXT_ENTRY_FILES, REACT_ENTRY_FILES } from "../utils/constants";

const FIXTURES = [
  {
    name: "Infisical",
    root: path.join("src", "infisical-main", "frontend"),
    expectedFramework: "react",
  },
  {
    name: "Formbricks",
    root: path.join("src", "formbricks-main", "apps", "web"),
    expectedFramework: "nextjs",
  },
  {
    name: "Plane",
    root: path.join("src", "plane-preview", "apps", "web"),
    expectedFramework: "remix",
  },
] as const;

const GLOB_IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/.next/**",
  "**/build/**",
  "**/.turbo/**",
];

const SAMPLE_LIMIT = 30;
const MISS_LIMIT = 25;

function basenameHeuristics(framework: string): string[] {
  const svelteNames = [
    "+page.svelte",
    "+page.ts",
    "+page.js",
    "+layout.svelte",
    "+layout.ts",
    "+layout.js",
    "+error.svelte",
    "+server.ts",
    "+server.js",
    "+page.server.ts",
    "+page.server.js",
  ];

  if (framework === "nextjs" || framework === "remix") {
    return [...new Set([...NEXT_ENTRY_FILES, ...REACT_ENTRY_FILES, "routes.ts", "routes.js"])];
  }
  if (framework === "svelte") {
    return svelteNames;
  }
  return [...REACT_ENTRY_FILES, "route.tsx", "route.ts", "route.jsx", "route.js", "layout.tsx", "layout.ts"];
}

function findMisses(
  projectRoot: string,
  framework: string,
  discovered: Set<string>
): string[] {
  const names = basenameHeuristics(framework);
  const candidates = globSync("**/*.{js,jsx,ts,tsx,vue,svelte}", {
    cwd: projectRoot,
    ignore: GLOB_IGNORE,
  });

  const misses: string[] = [];
  for (const file of candidates) {
    const base = path.basename(file);
    if (!names.includes(base)) continue;
    const normalized = path.normalize(file);
    if (!discovered.has(normalized)) {
      misses.push(normalized);
    }
  }
  return misses;
}

function printScorecard(
  name: string,
  projectRoot: string,
  expectedFramework: string
): void {
  const absoluteRoot = path.resolve(projectRoot);
  const framework = autoDetectFramework(absoluteRoot);
  const codeAlias = autoDiscoverCodeAlias(absoluteRoot);
  const pathAliases = codeAlias
    ? resolveTsConfigPaths(path.join(absoluteRoot, codeAlias))
    : {};
  const entries = collectProjectEntryPoints(absoluteRoot, framework);
  const discovered = new Set(entries.map((e) => path.normalize(e)));
  const misses = findMisses(absoluteRoot, framework, discovered);

  console.log("=".repeat(72));
  console.log(`${name}  (${projectRoot})`);
  console.log("-".repeat(72));
  console.log(`framework:          ${framework}${framework !== expectedFramework ? `  (expected ${expectedFramework})` : ""}`);
  console.log(`codeAlias:          ${codeAlias ?? "(none)"}`);
  console.log(`path alias keys:    ${Object.keys(pathAliases).join(", ") || "(none)"}`);
  console.log(`entry count:        ${entries.length}`);
  console.log(`miss heuristic:     ${misses.length}`);
  console.log("");
  console.log(`entries (first ${SAMPLE_LIMIT}):`);
  for (const entry of entries.slice(0, SAMPLE_LIMIT)) {
    console.log(`  ${entry}`);
  }
  if (entries.length > SAMPLE_LIMIT) {
    console.log(`  ... +${entries.length - SAMPLE_LIMIT} more`);
  }
  console.log("");
  console.log(`misses (first ${MISS_LIMIT}):`);
  if (misses.length === 0) {
    console.log("  (none)");
  } else {
    for (const miss of misses.slice(0, MISS_LIMIT)) {
      console.log(`  ${miss}`);
    }
    if (misses.length > MISS_LIMIT) {
      console.log(`  ... +${misses.length - MISS_LIMIT} more`);
    }
  }
  console.log("");
}

function main(): void {
  console.log("Qleaner entry-point detection eval\n");
  for (const fixture of FIXTURES) {
    printScorecard(fixture.name, fixture.root, fixture.expectedFramework);
  }
}

main();
