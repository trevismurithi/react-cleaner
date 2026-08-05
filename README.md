# Qleaner — unused code & asset cleaner for React / Next / Vue

**Qleaner** (v2.0.0) finds unused files, images, dependencies, and dead code in **React**, **Next.js**, **Vue**, **Nuxt**, TypeScript, and JavaScript projects so you can shrink bundles and keep the codebase clean.

## What’s new in 2.0

- **Zero-prompt `init`** — auto-detects framework, path aliases, and package manager. Optional `[projectPath]` and `--force` to overwrite. Safe in CI: `qleaner init <path> --force`.
- **Single-path `image`** — `qleaner image [projectPath]` (no `-a`/`-r` or separate assets/code roots). Path styles resolve automatically (imports, `public`/`static`, `@/` aliases).
- **Stage-only logging** — stage timings instead of per-file progress bars; quieter, faster-feeling runs.
- **TypeScript source** — npm publishes compiled `dist/` (`prepublishOnly` runs `tsc`).

**Breaking (migrate from 1.x):**

- Replace `qleaner image <assetsDir> <codeRoot>` (and `-a`/`-r`) with `qleaner image [projectPath]`.
- Action input is **`image-project-path`** (not separate asset/code path inputs).
- `init` is non-interactive; use `--force` to overwrite an existing config.

**Speed:** Scans report stage timings and skip per-file progress bars, so large trees stay readable in CI and feel snappier locally. Smart cache (`unused-check-cache.json`) still speeds incremental runs.

## Features

- **Find Unused Code Files** - Identify files that aren't imported or used anywhere (including re-export–aware checks so barrel files are not false positives when their exports are used)
- **Find Unused Images** - Detect image assets that are never referenced in your code
- **Unused Dependencies** - Discover npm/yarn/pnpm packages that are installed but not used; optionally uninstall them in one step
- **Dead Image Links** - Find image references in code that point to non-existent files
- **Unused Exports** - Find exported symbols nothing imports; optional `--fix` to remove them
- **Vue & Nuxt** - Scan `.vue` single-file components (`@vue/compiler-sfc`); Vue/Nuxt detection during `qleaner init` sets `pages` / `layouts` exclusions and `.vue` globs
- **Prune Unused Code** - Remove unused variables, functions, and classes (with dry-run); **`-r` / `--report`** prints a file, line, name, and kind table
- **Prune Console Logs** - Strip `console` debug calls (`log`, `dir`, `dirxml`, `table`, `debug`, `info`, `trace`). With **`-d` / `--dry-run`**, reports **high / medium / low** counts; per-tier **hit tables** (file, line, preview) print when the dry-run payload includes `foundByRisk` **and** you pass **`--list-risk-categories`** (see `controllers/list.ts` → `runSurgicalPass`). **`-i` / `--list-risk-categories-info`** prints the risk category index (paths to [`utils/consoleLogHighRiskPatterns.ts`](utils/consoleLogHighRiskPatterns.ts) and [`utils/consoleLogMediumRiskPatterns.ts`](utils/consoleLogMediumRiskPatterns.ts)) and **returns without scanning**. **`--list-risk-categories` alone does not skip the scan**—use **`-d`** for a dry run or **`-i`** for docs only.
- **Duplicate Detection** - Find and clean duplicate functions and classes; **`-r` / `--report`** prints a detail table
- **Tidy** - Run the main cleanup pipeline (logs, unused code, duplicates, exports) in one command; optional **`[pathToScan]`** (default `.`) and **`--auto-fix` / `-u`**. **`-r` / `--report`** prints per-step dry-run tables for all four steps (console log tiers, unused code, duplicates, exports). **`--list-risk-categories`** limits extra console-log tier tables to that step only; **`-i`** prints the console-log risk index (pipeline continues).
- **Undo** - Restore files moved during cleanup from `.trash` (code or images)
- **Project Summary** - Get comprehensive statistics about your codebase
- **File Size Analysis** - Identify the largest files and potential optimization targets
- **Dependency Analysis** - See which files have heavy dependencies and hotspots
- **Smart Caching** - Fast incremental scans with intelligent cache invalidation (`unused-check-cache.json`, including `parentGraph.fixes` fingerprints for surgical passes when present)
- **Dry-Run Mode** - Where supported, `-d` / `--dry-run` matches the CLI: show what would be deleted without actually deleting (skips prompt)
- **Interactive Deletion** - Choose to delete files permanently or move them to `.trash`, or use **`scan --auto-fix`** to move all reported unused files to `.trash` without a prompt
- **Enhanced File Finding** - Advanced path resolution using jsconfig/tsconfig for accurate dependency tracking in large codebases with complex import structures
- **Advanced Image Detection** - Sophisticated AST parsing extracts image references from imports, requires, JSX, CSS, styled-components, template literals, arrays, and more

## Installation

### Global Installation

```bash
npm install -g qleaner
```

### Use with npx (No Installation)

```bash
npx qleaner <command>
```

### Local Development Dependency

```bash
yarn add qleaner --dev
# or
npm install qleaner --save-dev
```

## GitHub Actions

Qleaner ships a **composite GitHub Action** at the repo root: **[`action.yml`](action.yml)** (“Qleaner Health Guardian”). It installs the published **`qleaner`** package from npm and runs the global **`qleaner`** CLI — not `yarn start` from a cloned dev checkout.

Publish to the [GitHub Marketplace](https://github.com/marketplace?type=actions) by tagging a release (e.g. `v2.0.0`) that includes `action.yml`. Pin the same version on npm (`qleaner-version` input).

### What the action does

1. Sets up Node.js (default 20).
2. Runs `npm install -g qleaner@<version>` (default **2.0.0**).
3. Restores **`unused-check-cache.json`** from the Actions cache (key uses `qleaner.config.json` and `package-lock.json`).
4. Runs read-only captures in the job workspace:
   - `qleaner tidy <scan-path> …` → `tidy_report.txt` (quiet by default; pass `tidy-extra-args: "-r"` for per-step detail tables)
   - `qleaner image <projectPath> …` → `image_report.txt` (skipped if `image-project-path` is empty)
   - `qleaner summary` → `health_summary.txt`

No `--auto-fix` / `-u`: CI is dry-run only. The job succeeds when every command exits **0**.

### Use in your repository

**Prerequisites**

- Commit **`qleaner.config.json`** (run `qleaner init` locally, or in CI: `qleaner init <path> --force`).
- Add **`unused-check-cache.json`** and **`.trash/`** to `.gitignore` (`init` can do this).
- Set **`with:`** paths to match **your** app layout (not this repo’s Infisical sample tree).
- Pin the Action ref to a tag on this repo (e.g. `uses: trevismurithi/react-cleaner@v2.0.0`). Creating a GitHub Release publishes npm via [`.github/workflows/release.yml`](.github/workflows/release.yml) when `NPM_TOKEN` is set.

**Full workflow** (status check + PR health report comment):

Create **`.github/workflows/qleaner-health.yml`** in your project and adjust paths. The Action runs Qleaner; the following steps build `pr_report.md` from the npm-bundled script and post (or update) one sticky PR comment.

```yaml
name: Qleaner Health Guardian

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  workflow_dispatch:

jobs:
  hygiene-check:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run Qleaner
        uses: trevismurithi/react-cleaner@v2.0.0
        with:
          qleaner-version: "2.0.0"
          scan-path: src
          image-project-path: src
          # Optional: per-step detail tables (off by default)
          # tidy-extra-args: "-r"
          image-extra-args: "-d -T 0.1"

      - name: Build PR health report
        if: github.event_name == 'pull_request'
        env:
          NO_COLOR: "1"
        run: |
          REPORT_SCRIPT="$(npm root -g)/qleaner/dist/.github/scripts/pr-report.js"
          node "$REPORT_SCRIPT" \
            qleaner.stats.json health_summary.txt tidy_report.txt image_report.txt \
            > pr_report.md

      - name: Post PR Health Report
        if: always() && github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            if (!fs.existsSync('pr_report.md')) return;

            const body = fs.readFileSync('pr_report.md', 'utf8');
            const marker = '<!-- qleaner-report -->';

            const { data: comments } = await github.rest.issues.listComments({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              per_page: 100,
            });

            const existing = comments.find(c => c.body?.startsWith(marker));

            if (existing) {
              await github.rest.issues.updateComment({
                comment_id: existing.id,
                owner: context.repo.owner,
                repo: context.repo.repo,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                issue_number: context.issue.number,
                owner: context.repo.owner,
                repo: context.repo.repo,
                body,
              });
            }
```

- **`uses: …@v2.0.0`** must match an existing tag on `trevismurithi/react-cleaner` (e.g. `v2.0.0` — the ref is exact).
- **No image scan:** set `image-project-path` to `""` (or omit and rely on the default).
- **Quieter tidy:** leave `tidy-extra-args` unset; set `tidy-extra-args: "-r"` only when you want per-step dry-run detail tables.
- **Report only on PRs:** `workflow_dispatch` runs Qleaner but skips the comment steps (`if: github.event_name == 'pull_request'`).
- You do **not** copy [`.github/scripts/pr-report.ts`](.github/scripts/pr-report.ts) into your repo; it ships compiled as **`dist/.github/scripts/pr-report.js`** in the published **`qleaner`** npm package. The Action step installs that package globally first.

**Check-only workflow** (no PR comment — omit the last two steps and `pull-requests: write`).

**Action inputs** (all optional except you should set paths for your project):

| Input | Default | Purpose |
| --- | --- | --- |
| `qleaner-version` | `2.0.0` | npm version of `qleaner` to install |
| `node-version` | `20` | Node.js for `setup-node` |
| `scan-path` | `.` | First argument to `qleaner tidy` |
| `image-project-path` | *(empty)* | Project path for `qleaner image` (skipped when empty) |
| `tidy-extra-args` | *(empty)* | Optional tidy flags; pass `-r` for per-step detail tables |
| `image-extra-args` | `-d -T 0.1` | Extra image flags (dry-run + size threshold) |
| `skip-image` | `false` | Set `true` to skip image scan |
| `skip-summary` | `false` | Set `true` to skip summary |
| `restore-cache` | `true` | Restore `unused-check-cache.json` before the run |

**Outputs:** `tidy-report-file`, `image-report-file`, `summary-file` (filenames in the workspace).

The composite Action does **not** post to GitHub by itself — use the **full workflow** above for the PR comment.

### This repository (dogfooding)

[`.github/workflows/qleaner-health.yml`](.github/workflows/qleaner-health.yml) uses **`uses: ./`** to test the local `action.yml` while still installing **`qleaner@2.0.0` from npm** (available after the release is published). It uses `npx --yes tsx .github/scripts/pr-report.ts` from the checked-out repo instead of `$(npm root -g)/qleaner/...` (same script, easier for dogfooding). Paths under `with:` target the bundled Infisical sample tree (`src/infisical-main/frontend`, etc.) — copy the **full workflow** above for other repos, not those paths.

**Branch protection:** After the workflow runs on a PR, you can require status check **`hygiene-check`** (job id). If you see **“Expected — Waiting for status to be reported”**, the workflow did not run (workflow missing on the base branch, Actions disabled, or fork PR awaiting approval).

## Publishing (maintainers)

1. Add repo secret **`NPM_TOKEN`** (npm token with publish rights) in GitHub → Settings → Secrets.
2. Bump `"version"` in `package.json` (and lockfile) to match the release.
3. Merge to the default branch, then create a **GitHub Release** with tag **`vX.Y.Z`** matching that version (e.g. `v2.0.0` for `2.0.0`).
4. [`.github/workflows/release.yml`](.github/workflows/release.yml) runs on `release: published`: `npm ci` → `npm publish` (`prepublishOnly` builds `dist/`). Do not commit `dist/`.

## Monorepos

Run Qleaner **per package**, not from the repo root unless that root is itself an app:

```bash
cd apps/web
qleaner init .          # or: qleaner init apps/web from repo root
qleaner scan . --dry-run
qleaner image . --dry-run
```

Each package gets its own `qleaner.config.json` and `unused-check-cache.json`. In GitHub Actions, set `scan-path` and `image-project-path` to that package (e.g. `apps/web`), or use a matrix job per app later. There is no `init --workspaces` yet.

## Quick Start

### 1. Initialize Configuration

**IMPORTANT:** Proper configuration is critical for Qleaner to accurately find and resolve files in your project, especially for large codebases.

Set up Qleaner for your project (non-interactive):

```bash
qleaner init
# Nested app / monorepo package:
qleaner init apps/web
# Overwrite existing config:
qleaner init . --force
```

`init` auto-detects:

1. **Path to scan** — optional `[projectPath]` (default cwd); written into `qleaner.config.json`
2. **Package manager** — from lockfiles (npm / yarn / pnpm)
3. **Framework** — React, Next.js, Vue, Nuxt, or vanilla (entry-point patterns and Vue/Nuxt directory exclusions)
4. **Path aliases** — from `tsconfig` / `jsconfig` when present (including discovered `codeAlias`)

Review or edit `qleaner.config.json` if detection misses an alias or entry file. Manually add `paths` when you have no tsconfig/jsconfig (see Configuration below).

This creates `qleaner.config.json` and updates **`.gitignore`**: a **`# Qleaner`** section with **`unused-check-cache.json`** and **`.trash/`** when those patterns are not already ignored.

### 2. Scan for Unused Code Files

Scan for unused files. Pass a **directory as the first argument** (`[pathToScan]`, default **`.`**), or rely on the `path` field in `qleaner.config.json` when you omit it.

```bash
# Dry run (recommended first time) — explicit directory
qleaner scan src --dry-run

# Current directory (same as qleaner scan . --dry-run)
qleaner scan --dry-run

# Actual scan (will prompt for deletion unless --auto-fix)
qleaner scan src
```

### 3. Scan for Unused Images

Find images that aren't referenced in your project (inventory + code refs under one path):

```bash
# Scan the current project (cwd)
qleaner image --dry-run

# Scan a nested app (same path style as init/scan)
qleaner image src/infisical-main/frontend --dry-run -H
```

**Breaking change:** older `qleaner image <assetsDir> <codeRoot>` (and `-a`/`-r`) is replaced by a single optional `[projectPath]`. Path styles are resolved automatically.

## Commands

The CLI is implemented in [`bin/cli.ts`](https://github.com/trevismurithi/react-cleaner/blob/main/bin/cli.ts) and published as `dist/bin/cli.js`. Program name **`qleaner`**, tagline *A tool to clean up your React code*, and **`qleaner --version`** match that file (version is read from `package.json`). Run **`qleaner --help`** for the same command and option list Commander registers there.

### `qleaner init`

Non-interactive setup: detects framework, package manager, path aliases, and entry points, then writes `qleaner.config.json`. Safe for CI.

**Arguments:**
- `[projectPath]` - Project root to initialize (default: cwd)

**Options:**
- `-f, --force` - Overwrite an existing `qleaner.config.json`

After writing the config, init updates **`.gitignore`**: it adds **`unused-check-cache.json`** and **`.trash/`** under a **`# Qleaner`** heading only when those entries are not already present.

**What gets detected:**
1. **Path** — `[projectPath]` or cwd
2. **Package manager** — npm / yarn / pnpm from lockfiles
3. **Framework** — React, Next.js, Vue, Nuxt, or vanilla (entry-point patterns; Vue/Nuxt get `layouts` / `pages` in `excludeDirPrint` and `.vue` globs)
4. **Path aliases** — from tsconfig/jsconfig when present

**Configuration still matters:** Review `paths`, `codeAlias`, and `excludeFilePrint` after init. Incorrect aliases can cause false positives. Without tsconfig/jsconfig, set `paths` manually (see Configuration): `"paths": { "@/*": ["./src/*"] }`.

**Examples:**
```bash
qleaner init
qleaner init apps/web
qleaner init . --force

cat qleaner.config.json
qleaner scan . --dry-run
```

**Note:** Without `--force`, init exits if `qleaner.config.json` already exists.

### `qleaner scan`

Scan a directory for unused code files. Merge order: values from `qleaner.config.json` first, then CLI flags (CLI wins).

**Arguments:**
- `[pathToScan]` - Directory to scan (default **`.`**; combined with config `path` and exclusions as implemented in `command.ts`)

**Options:**
- `-e, --exclude-dir <dir...>` - Exclude directories from scan (e.g., `-e node_modules dist`)
- `-f, --exclude-file <file...>` - Exclude specific files by name (e.g., `-f config.js`)
- `-F, --exclude-file-print <files...>` - Scan but don't report as unused (for entry points)
- `-x, --exclude-extensions <extensions...>` - Exclude file extensions (e.g., `-x test.tsx test.ts`)
- `-t, --table` - Display results in a formatted table
- `-d, --dry-run` - Show what would be deleted without actually deleting (skips prompt)
- `-u, --auto-fix` - Skip the interactive prompt and move **all** reported unused files to `.trash` (only when **not** using `--dry-run`; same flag name as `dep` is **not** shared: on `scan` this is auto-fix, on `dep` `-u` is `--uninstall`)
- `-C, --clear-cache` - Clear cache before scanning (useful after major changes)

**Examples:**
```bash
# Basic scan (will prompt for deletion if unused files found)
qleaner scan src

# Dry run with table output (recommended first time)
qleaner scan src --dry-run --table

# Move every reported unused file to .trash without prompting (use after a trusted dry-run)
qleaner scan src --auto-fix

# Exclude test files and multiple directories
qleaner scan src -x test.tsx test.ts test.js test.jsx -e node_modules dist build

# Exclude specific files from being reported as unused (entry points)
qleaner scan src -F index.tsx main.tsx app.tsx

# Clear cache and perform fresh scan
qleaner scan src --clear-cache

# Comprehensive scan with multiple exclusions
qleaner scan src --exclude-dir node_modules dist build --exclude-extensions test.tsx test.ts --table
```

### `qleaner image [projectPath]`

Scan for unused images under a single project directory. Inventories image files (png, jpg, jpeg, svg, gif, webp, ico, avif) and matches them against references in code/CSS. Resolves imports, relative paths, `public/`/`static/` URLs, and `@/`/`~/` aliases automatically.

**Arguments:**
- `[projectPath]` - Project root to scan (default: cwd). Same path style as `qleaner init` / `qleaner scan`.

**Options:**
- `-u, --auto-prune` - Move **all** reported unused images to **`.trash`** without a prompt (only when **not** using `--dry-run`)
- `-T, --size-threshold-mb <megabytes>` - Highlight unused images larger than this size in the report (table column or list suffix; display only)
- `-e, --exclude-dir-assets <dir...>` - Exclude directories from image file scan (can specify multiple)
- `-F, --exclude-file-assets <file...>` - Exclude specific image files by name pattern
- `-E, --exclude-dir-code <dir...>` - Exclude directories when scanning code for image references (e.g., `-E node_modules dist`)
- `-S, --exclude-file-code <file...>` - Exclude specific files when scanning code for image references
- `-t, --table` - Display results in a formatted table with columns: Unused Images, In Code, Exists, Size
- `-C, --clear-cache` - Clear cache before scanning (recommended after major code changes)
- `-H, --hide-not-found-images` - Hide images referenced in code but not found on disk (dead links)
- `-d, --dry-run` - Show what would be deleted without actually deleting; does not move files and does not run `--auto-prune`

**Breaking change:** the old two-argument form `qleaner image <assetsDir> <codeRoot>` and the `-a`/`-r` flags are removed. Use one project path instead.

**Examples:**
```bash
# Scan cwd
qleaner image --dry-run

# Nested app
qleaner image src/infisical-main/frontend --dry-run

# Dry run with table format
qleaner image . --dry-run --table

# Hide dead image links and use table format
qleaner image . -H -t

# Exclude directories from code scan
qleaner image . -E node_modules dist test

# Exclude specific directories from asset scan
qleaner image . -e icons fonts

# Clear cache and rescan
qleaner image . --clear-cache

# Comprehensive scan with common options
qleaner image . --exclude-dir-code node_modules dist --hide-not-found-images --table --dry-run

# Highlight unused images larger than 2 MB (report only)
qleaner image . --dry-run -T 2 --table

# Move all unused images to .trash without prompting (after a trusted dry-run)
qleaner image . --auto-prune
```

**Supported Image Reference Patterns:**

Qleaner automatically detects images referenced through various patterns:

- **ES6 Imports:** `import logo from './logo.png'`
- **CommonJS Require:** `require('./logo.png')` or `require('./logo.png')`
- **Dynamic Imports:** `import('./logo.png')` or `import('./assets/${name}.png')`
- **JSX Attributes:** `<img src="./logo.png" />` or `<img src={imagePath} />`
- **React Style Props:** `style={{ backgroundImage: "url('./logo.png')" }}`
- **CSS Files:** `url('./logo.png')` or `url('/images/logo.png')`
- **Styled-Components:** `` css`background-image: url('./logo.png')` `` or `` styled.div`background: url('./bg.png')` ``
- **Arrays:** `const images = ['./logo.png', './icon.png']`
- **Template Literals:** `` `./logo-${name}.png` `` or `` `/images/${type}.png` ``
- **String Literals:** Any string containing an image path pattern

### `qleaner list <dependency>`

List files that **import** modules whose resolved paths match your query. The matcher splits `<dependency>` on `/` and finds graph nodes whose file path contains **every** segment; it then prints the union of those nodes’ `importedBy` files (direct importers). Works well for package names (`lodash`), nested paths (`react-router/dom`), or path fragments that appear in resolved file paths.

**Arguments:**
- `<dependency>` - Dependency or path pattern (e.g., `react-router`, `lodash`, `utils/helpers`)

**Options:**
- `-t, --table` - Display results in a table format

**Examples:**
```bash
# List files using react-router
qleaner list react-router

# List files touching a path segment
qleaner list utils/helpers

# List files using lodash with table format
qleaner list lodash --table

# Find files using a specific package
qleaner list axios
```

**Note:** Requires `unused-check-cache.json`. Run `qleaner scan` (with `-p` or config `path`) first.

### `qleaner dep`

List unused **production** `dependencies` from `package.json` by comparing package names to the dependency graph (packages with no importers in the graph are listed).

**Options:**
- `-d, --directory <directory>` - Directory containing `package.json` to read (defaults to current directory)
- `-t, --table` - Display results in a table format
- `-u, --uninstall` - After listing, uninstall each unused dependency using your configured package manager (on **`dep`** only; **`scan`** uses `-u` for `--auto-fix`, not uninstall.)

**Examples:**
```bash
# Find unused dependencies in current directory
qleaner dep

# Check dependencies in a specific package/monorepo directory
qleaner dep -d ./packages/my-package

# Display results in table format
qleaner dep --table

# Uninstall unused production dependencies (use after dry review)
qleaner dep --uninstall
```

**Note:** Requires `unused-check-cache.json`. Run `qleaner scan` first. Only analyzes `dependencies`, not `devDependencies`.

### `qleaner exports`

List **unused exports** (symbols exported from a file that nothing imports, following the same graph as the scan). Use `--fix` to apply edits that remove those exports.

**Arguments:**
- `[pathToScan]` - Project directory to analyze (default **`.`**)

**Options:**
- `-r, --fresh-scan` - Clear graph-related state before analyzing (via `scan` with `clearCache` as implemented in `unusedExports`)
- `-f, --fix` - Fix (remove) the unused exports
- `-d, --dry-run` - Only print how many unused exports were found (no table unless `--report`)
- `--report` - Print a table of unreferenced exports (export name and file); works with or without `--dry-run` (`-r` on this command is **`--fresh-scan`**)

**Examples:**
```bash
qleaner exports . --dry-run
qleaner exports . --dry-run --report
qleaner exports . --fix --report
```

**Note:** Requires `unused-check-cache.json` from `qleaner scan` over the same project tree you care about. With `--fix`, files are edited in place—use version control.

### `qleaner prune`

Remove **unused internal declarations** (unused variables, functions, classes, etc.) via static analysis. Always try `--dry-run` first.

**Arguments:**
- `[pathToScan]` - Directory whose files are globbed from config (default **`.`**)

**Options:**
- `-d, --dry-run` - Show what would be deleted without actually deleting (skips prompt)
- `-r, --report` - Print a table of unused symbols (file, line, name, kind); works with or without `--dry-run`

**Examples:**
```bash
qleaner prune . --dry-run -r
qleaner prune . -r
qleaner prune .
```

**Note:** Operates on files discovered from `qleaner.config.json` (`path` and exclusions). Large refactors may update `qleaner.stats.json` with change statistics.

### `qleaner prune-logs`

Remove **`console`** debug calls: `log`, `dir`, `dirxml`, `table`, `debug`, `info`, `trace` (standalone expression statements only).

> **Note:** `qleaner prune-logs --help` may describe flags differently; **runtime behavior** matches [`controllers/list.ts`](controllers/list.ts) (`pruneConsoleLogs`, `runSurgicalPass`) as summarized below.

**Arguments:**
- `[pathToScan]` - Directory to scan (default **`.`**); globs come from `qleaner.config.json` like other prune commands

**Options:**
- `-d, --dry-run` - Report counts only (no edits). Prints totals as **`N (high-risk sensitive: H, medium: M, low: L)`**. With **`--list-risk-categories`** also set, prints per-tier **hit tables** (file, line, preview) when the dry-run result includes `foundByRisk` (capped per tier in `controllers/list.ts`).
- **`-i` / `--list-risk-categories-info`** - Print the risk-tier **category index** (pattern file paths and section titles), then **return** without scanning or editing.
- **`--list-risk-categories`** - Does **not** skip the scan by itself. Use with **`-d`** to dry-run and optionally show hit tables as above, or use **`-i`** for the index-only path.

**Heuristics (not a security scanner):** Patterns live in **`utils/consoleLogHighRiskPatterns.ts`** and **`utils/consoleLogMediumRiskPatterns.ts`**; classification order is high → medium → low.

**Examples:**
```bash
# Risk index only (no scan, no edits) — preferred for CI / docs
qleaner prune-logs -i

# Dry-run counts (hit tables only if you also pass --list-risk-categories)
qleaner prune-logs src --dry-run
qleaner prune-logs src --dry-run --list-risk-categories

# Apply removals (not a dry run)
qleaner prune-logs src
```

### `qleaner duplicates`

Detect and clean **duplicate** code patterns across files under the configured `path`.

**Arguments:**
- `[pathToScan]` - Directory to scan (default **`.`**)

**Options:**
- `-d, --dry-run` - Show what would be deleted without actually deleting (skips prompt)
- `-r, --report` - Print a table of duplicate functions and classes (file, line, name, kind); works with or without `--dry-run`

**Examples:**
```bash
qleaner duplicates . --dry-run -r
qleaner duplicates . -r
qleaner duplicates .
```

### `qleaner undo <type>`

Restore files from **`.trash`** after a cleanup that moved files instead of deleting them permanently.

**Arguments:**
- `<type>` - `code` or `images` depending on which kind of deletion you want to revert

**Examples:**
```bash
qleaner undo code
qleaner undo images
```

### `qleaner tidy`

**Tidy up the project** — runs a pipeline of checks; each step **dry-runs first**, then applies edits **only if** `--auto-fix` / `-u` is set and the dry-run reported work.

**Arguments:**
- `[pathToScan]` - Project root or source directory for globs (default **`.`**)

**Options:**
- `-u, --auto-fix` - After a successful dry-run count for a step, run the real pass (console logs, internal unused code, duplicates, **unused exports with `--fix`**). Finishes with a **dry-run `scan`** (unused files listed, not moved).
- **`-r` / `--report`** - During each step’s dry-run, print detail tables: console log tiers, unused code, duplicates, and exports (also enables console-log tier tables; same as passing **`--list-risk-categories`** for that step).
- **`--list-risk-categories`** - Console-log step only: per-tier hit tables when `foundByRisk` is present (also enabled when **`-r`** is set).
- **`-i` / `--list-risk-categories-info`** - Print the console-log risk category index; tidy **continues** with remaining steps.

Sequence (see `controllers/list.ts`):

1. **Console logs** — dry-run (counts + tier tables with **`-r`** or **`--list-risk-categories`**) → apply if **`--auto-fix`**  
2. **Unused internal code** — `prune` dry-run (detail table with **`-r`**) → apply if needed  
3. **Duplicates** — dry-run (detail table with **`-r`**) → apply if needed  
4. **Unused exports** — dry-run (detail table with **`-r`**) → apply with **fix** if needed  
5. **Unused files scan** — `scan` with `dryRun: true` only when **`--auto-fix`** ran (reports unused files; does not move them)

Prefer exercising `prune`, `prune-logs`, `duplicates`, `exports`, and `scan` manually with **`--dry-run`** and **`-r`** until you trust the behavior.

**Examples:**
```bash
# Dry-run each step; no edits
qleaner tidy

# Per-step detail tables (CI default: tidy-extra-args "-r")
qleaner tidy -r

# Risk index for console logs (pipeline continues)
qleaner tidy -i

# Apply safe code cleanups when issues are found
qleaner tidy . --auto-fix
```

### `qleaner summary`

Get comprehensive project statistics and insights. (`qleaner summary --help` uses the short description *List all the imports in the project*; the sections below describe the full behavior.)

**Options:**
- `-l, --largest-files` - Show top 10 largest code and image files
- `-d, --dependencies` - Show dependency analysis and hotspots

**Note:** When no options are provided, shows a general project summary with totals.

**Examples:**
```bash
# Full project summary
qleaner summary

# Show largest files
qleaner summary --largest-files

# Show dependency analysis
qleaner summary --dependencies
```

**Summary Output Breakdown:**

**General Summary** (no flags):
- Total code files count
- Total image files count
- Total unused files count
- Total unused images count
- Total dead image links count
- Total files count

**Largest Files** (`-l` or `--largest-files`):
- Top 10 largest code files (sorted by size in KB)
- Top 10 largest image files (sorted by size in MB)
- Total code size and total image size
- Code files exceeding 100 KB (warning list)

**Dependencies** (`-d` or `--dependencies`):
- Top 10 files with heavy dependencies (most imports)
- Top 10 files with light dependencies (fewest imports)
- Top 10 file hotspots (most imported files - files that many other files import)
- Top 10 dependency hotspots (most used dependencies/packages)
- Top 10 dead image hotspots (dead image links referenced by many files)
- Top 10 alive image hotspots (images referenced by many files)

**Note:** Requires a cache file. Run `qleaner scan` to generate code cache and/or `qleaner image [projectPath]` to generate image cache first.

## Configuration

Qleaner can be configured via `qleaner.config.json` or CLI flags. For **`qleaner scan`**, CLI flags override values merged from the config file.

### Configuration File Structure

```json
{
  "path": "src",
  "framework": "react",
  "codeAlias": "tsconfig.json",
  "paths": {},
  "packageManager": "yarn",
  "excludeDir": ["node_modules", "dist", "build", ".next"],
  "excludeFile": ["payload-types.ts"],
  "excludeExtensions": [".test.tsx", ".test.ts"],
  "excludeDirPrint": [],
  "excludeFilePrint": ["index.js", "index.tsx", "main.js"],
  "excludeDirAssets": [],
  "excludeFileAssets": [],
  "excludeDirCode": ["node_modules", "dist"],
  "excludeFileCode": [],
  "isRootFolderReferenced": true,
  "alias": false,
  "autoFix": false,
  "autoPrune": false,
  "sizeThresholdMb": null
}
```

### Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `path` | string | Default directory for `qleaner scan` (when `-p` is omitted) and for commands that glob from config (`exports`, `prune`, `prune-logs`, `duplicates`, `tidy`). Often your app root or `src`. |
| `autoFix` | boolean | When `true` (and not overridden), `qleaner scan` without `--dry-run` moves all reported unused files to `.trash` via `moveToTrash` instead of opening the interactive delete prompt (same effect as `--auto-fix` / `-u` on the scan command). |
| `autoPrune` | boolean | When `true`, `qleaner image` without `--dry-run` moves all reported unused images to `.trash` without a prompt (same as `--auto-prune` / `-u` on the image command). |
| `sizeThresholdMb` | number \| null | Optional default for highlighting large unused images in the image report (same semantics as `--size-threshold-mb` / `-T`). |
| `framework` | string | One of `react`, `nextjs`, or `vue` (use **`vue`** for Vue and **Nuxt** apps). Sets default `excludeFilePrint` and, for Vue, default `excludeDirPrint` (`layouts`, `pages`). |
| `codeAlias` | string \| null | **Critical!** Config file to use for path alias resolution. Options: `"tsconfig.json"`, `"jsconfig.json"`, `"tsconfig.app.json"`, `"tsconfig.base.json"`, or `null` for manual configuration. Qleaner reads path aliases from this file to resolve imports (e.g., `@/components`, `~/utils`). |
| `paths` | object | **Manual path aliases** (only used if `codeAlias` is `null`). Object mapping alias patterns to file paths. Example: `{ "@/*": ["./src/*"], "~/*": ["./src/*"] }`. If `codeAlias` is set, this field is ignored and paths are read from the config file instead. |
| `packageManager` | string | Package manager used: `npm`, `yarn`, or `pnpm` |
| `excludeDir` | string[] | Directories to exclude from code scans |
| `excludeFile` | string[] | Files to exclude by name from code scans |
| `excludeExtensions` | string[] | File extensions to exclude (e.g., `["test.tsx"]`) |
| `excludeDirPrint` | string[] | Path segments matched against file paths; matching files are **excluded from the unused-files result** (e.g. Vue defaults `layouts`, `pages`) |
| `excludeFilePrint` | string[] | Entry point files to scan but not report as unused |
| `excludeDirAssets` | string[] | Directories to exclude from image scans |
| `excludeFileAssets` | string[] | Image files to exclude by name |
| `excludeDirCode` | string[] | Directories to exclude when scanning code for image references |
| `excludeFileCode` | string[] | Files to exclude when scanning code for image references |
| `isRootFolderReferenced` | boolean | `true` if image paths are root-referenced (e.g., `/images/logo.png`) |
| `alias` | boolean | `true` if image paths use aliases (e.g., `@/assets/images/logo.png`) |

**Important Configuration Notes:**

1. **`codeAlias` and `paths`:** 
   - If `codeAlias` is set (e.g., `"tsconfig.json"`), Qleaner will read path aliases from that config file. The `paths` field will be ignored.
   - If `codeAlias` is `null`, Qleaner will use the `paths` field for manual path alias configuration.
   - **Getting this right is crucial** for accurate file resolution in large codebases!

2. **`isRootFolderReferenced` and `alias`:** These should not both be `true` or both be `false`. Set one to `true` and the other to `false`.

### Manual Path Configuration

If you don't use `jsconfig.json` or `tsconfig.json`, or need custom path resolution, you can manually configure paths in `qleaner.config.json`:

```json
{
  "codeAlias": null,
  "paths": {
    "@/*": ["./src/*"],
    "~/*": ["./src/*"],
    "components/*": ["./src/components/*"],
    "utils/*": ["./src/utils/*"]
  }
}
```

The `paths` object follows the same format as TypeScript's path mapping:
- **Key:** The alias pattern (e.g., `"@/*"` matches `@/components`, `@/utils`, etc.)
- **Value:** Array of actual file paths to resolve to (relative to project root)

**Example:** If you have `import Button from '@/components/Button'` in your code, and your config has `"@/*": ["./src/*"]`, Qleaner will resolve it to `./src/components/Button.tsx` (or `.ts`, `.jsx`, `.js`).

### Default Exclusions

Qleaner automatically excludes common build and generated directories:
- `node_modules`, `dist`, `build`, `.next`, `out`
- `coverage`, `.turbo`, `.vite`, `.cache`
- `.vercel`, `.netlify`, `storybook-static`
- `generated`, `prisma`, `graphql`, `supabase`, `drizzle`, `__generated__`

### Framework-Specific Entry Points

**React:**
- `index.js`, `index.jsx`, `index.ts`, `index.tsx`
- `main.js`, `main.jsx`, `main.ts`, `main.tsx`

**Vue:** Default `excludeFilePrint` may be empty after init; typical unused-file exclusions use `excludeDirPrint` (`layouts`, `pages`) so framework routes are not flagged.

**Next.js:**
- `page.tsx`, `page.jsx`, `route.ts`, `route.jsx`
- `layout.tsx`, `layout.jsx`
- `middleware.ts`, `middleware.js`
- `error.tsx`, `error.jsx`, `loading.tsx`, `loading.jsx`
- `not-found.tsx`, `not-found.jsx`
- `global-error.tsx`, `global-error.jsx`
- `_app.tsx`, `_app.jsx`, `_document.tsx`, `_document.jsx`
- `_error.tsx`, `_error.jsx`

## Caching

Qleaner uses intelligent caching to speed up subsequent scans:

- **File Hashing** - Files are only re-analyzed if their content changed
- **Incremental Updates** - Only changed files are re-processed
- **Cache Location** - `unused-check-cache.json` in your project root

Some edit-heavy commands (`prune`, `prune-logs`, `duplicates`, `exports --fix`) may append summary metrics to **`qleaner.stats.json`** in the project root.

**When to Clear Cache:**
- After major refactoring
- When dependencies change significantly
- If you get unexpected results

```bash
# Clear cache and rescan
qleaner scan src --clear-cache
```

## File Deletion

When you run **`qleaner scan`** without `--dry-run`:

- **Default** — Qleaner prompts you to select unused files and whether to move them to **`.trash`** or delete permanently (`askDeleteFiles`).
- **`--auto-fix` / `-u`** (or `autoFix: true` in config, merged like other scan options) — Skips the prompt and moves **all** reported unused files to **`.trash`** in one step (`moveToTrash`).

**Recommended Workflow:**
1. Run with `--dry-run` first to see what would be deleted
2. Review the results carefully
3. Run without `--dry-run` and either use the interactive flow or `--auto-fix` if you want everything moved to `.trash` without prompts
4. Prefer **Move to `.trash`** when using the interactive flow
5. Test your application
6. Empty `.trash` when confident

## How It Works

### Code Analysis
1. **File Discovery** - Uses `fast-glob` to find all code files matching patterns with intelligent exclusion handling
2. **Path Alias Resolution** - Reads path aliases from your `jsconfig.json` or `tsconfig.json` (or manual `paths` config) to understand how imports are resolved. This enables accurate file finding even in large codebases with complex import structures.
3. **AST Parsing** - Parses JavaScript/TypeScript with Babel; **`.ts` / `.mts` / `.cts`** are parsed without the JSX plugin so TypeScript angle-bracket assertions (e.g. `<Type>expr`) are valid, while **`.tsx` / `.js` / `.jsx`** keep JSX parsing. **Vue & Nuxt:** `.vue` SFCs are compiled with **`@vue/compiler-sfc`**; script blocks use **`lang`** for the TS/JSX split. Image and dependency scanning understand `.vue` files (`utils/astParser.ts`, `utils/fileProcessing.ts`, `controllers/image.ts`). For **Nuxt**, run `qleaner init`, choose **Vue**, and set `path` to your app root (e.g. `src/` or project root).
4. **Module Resolution** - Uses `enhanced-resolve` with your project's path aliases to resolve import paths accurately. Supports:
   - Path aliases (e.g., `@/components`, `~/utils`)
   - Relative imports (`./component`, `../utils`)
   - Node modules (`react`, `lodash`)
   - Directory index files (automatically resolves `./components` to `./components/index.ts`)
5. **Dependency Graph** - Builds a comprehensive graph of file dependencies, tracking both imports and exports
6. **Unused Detection** - Identifies files with no incoming imports (except entry points in `excludeFilePrint` and paths matching `excludeDirPrint`). Files that are only used via **re-exports** (barrel files) are treated as used when downstream files import the exported symbols or `*`.

### Image Analysis
1. **Image Discovery** - Finds all image files (png, jpg, jpeg, svg, gif, webp) using glob patterns with exclusion support
2. **Advanced Code Scanning** - Uses sophisticated AST traversal to extract image references from:
   - ES6 import statements (`import logo from './logo.png'`)
   - CommonJS require (`require('./logo.png')`)
   - Dynamic imports (`import('./logo.png')`)
   - JSX attributes (`<img src="./logo.png" />`)
   - React style props (`style={{ backgroundImage: "url('./logo.png')" }}`)
   - CSS files (`url('./logo.png')` or `url('/images/logo.png')`)
   - Styled-components (`` css`background-image: url('./logo.png')` ``)
   - Arrays (`const images = ['./logo.png', './icon.png']`)
   - Template literals (`` `./logo-${name}.png` ``)
   - String literals (any string containing an image path pattern)
   - Spread elements in arrays
3. **Path Normalization** - Normalizes paths based on alias/root configuration, handling both relative and absolute paths
4. **Unused Detection** - Compares image files against all discovered references to identify truly unused images

## 📊 Example Workflow

```bash
# 1. Initialize configuration (CRITICAL STEP - get this right!)
qleaner init
# Make sure to select the correct jsconfig.json or tsconfig.json file
# Verify the generated qleaner.config.json has the correct codeAlias

# 2. Verify your configuration
cat qleaner.config.json
# Check that codeAlias matches your project's config file

# 3. Scan for unused code files (dry run first!)
qleaner scan src --dry-run --table

# 4. Review results - if you see false positives, check your config
# Fix codeAlias or paths if needed, then clear cache and rescan:
qleaner scan src --clear-cache --dry-run --table

# 5. Scan for unused images (dry run)
qleaner image . --dry-run --table

# 6. Check for unused dependencies
qleaner dep --table

# 7. Optional: unused exports, prune, logs, duplicates (dry-run first)
qleaner exports . --dry-run
qleaner prune . --dry-run
qleaner prune-logs -i
qleaner prune-logs src/infisical-main/frontend --dry-run
qleaner duplicates . --dry-run

# 8. Get project summary
qleaner summary

# 9. Get largest files report
qleaner summary --largest-files

# 10. Get dependency analysis
qleaner summary --dependencies

# 11. Once confident with results, run actual scans and delete files
qleaner scan src
qleaner image .

# 12. Optional one-shot cleanup (dry-run each step; add --auto-fix to apply)
# qleaner tidy
# qleaner tidy . --auto-fix
```

## Use Cases

- **Before Deployment** - Clean up unused files to reduce bundle size
- **Code Review** - Verify no unused files are being added
- **Refactoring** - Find files that can be safely removed
- **Optimization** - Identify large files and dependency hotspots
- **Maintenance** - Regular cleanup to keep codebase healthy

## Requirements

- Node.js 14+ (LTS recommended)
- npm or yarn

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT

## Links

- **Repository:** [https://github.com/trevismurithi/react-cleaner](https://github.com/trevismurithi/react-cleaner)
- **Issues:** [https://github.com/trevismurithi/react-cleaner/issues](https://github.com/trevismurithi/react-cleaner/issues)
- **NPM Package:** [https://www.npmjs.com/package/qleaner](https://www.npmjs.com/package/qleaner)

## 📚 Additional Resources

### Tips for Best Results

1. **Get configuration right first** - **Most important!** Ensure `codeAlias` points to the correct `jsconfig.json` or `tsconfig.json` file, or manually configure `paths` if you don't use these config files. Incorrect configuration leads to false positives and missed dependencies.
2. **Verify your config file** - After running `qleaner init`, check that `codeAlias` matches your project's actual config file. For monorepos, you may need `tsconfig.app.json` or `tsconfig.base.json` instead of `tsconfig.json`.
3. **Run scans regularly** - Set up a cron job or CI check to catch unused files early
4. **Use dry-run first** - Always preview with `--dry-run` before deleting anything
5. **Review entry points** - Make sure `excludeFilePrint` in config includes all entry point files (index.tsx, main.js, etc.)
6. **Clear cache when needed** - After major refactoring, dependency changes, or config file updates, use `--clear-cache` for accurate results
7. **Test after deletion** - Always test your application thoroughly after removing files
8. **Use table format for large outputs** - The `-t` flag makes results easier to read
9. **Check summary regularly** - Use `qleaner summary` to monitor project health
10. **For large codebases** - The enhanced file finding mechanism with proper config ensures accurate results even in projects with thousands of files and complex import structures

### Command Dependencies

**Best practice:** Run `qleaner scan <your-src>` (or `qleaner scan` with `path` in `qleaner.config.json`) before commands that need `unused-check-cache.json`.

| Command | Requires |
|---------|----------|
| `qleaner list <dependency>` | `unused-check-cache.json` from `qleaner scan` |
| `qleaner dep` | `unused-check-cache.json` from `qleaner scan` |
| `qleaner exports` | `unused-check-cache.json` from `qleaner scan` |
| `qleaner summary` | Code and/or image cache from `qleaner scan` / `qleaner image` |
| `qleaner prune`, `prune-logs`, `duplicates` | `qleaner.config.json` with `path`; optional `unused-check-cache.json` for incremental behavior / `parentGraph.fixes` |
| `qleaner tidy` | Config, scan cache for the exports step, and the same prerequisites as the sub-steps |

### Common Issues

**Q: Qleaner reports files as unused that are actually used.**
A: 
1. **Check your configuration** - Most commonly, this happens when `codeAlias` is incorrect or `paths` is not configured properly. Verify that Qleaner can resolve your import aliases:
   - Ensure `codeAlias` points to the correct config file (check if it exists and has the right path mappings)
   - If using manual `paths`, verify the alias patterns match your imports
   - Try running with `--clear-cache` after fixing config
2. These might be entry points - Add them to `excludeFilePrint` in your config or use `-F` flag
3. Verify the file is actually imported - Check with `qleaner list <file-path>` to see if it's referenced
4. Check for dynamic imports - Some dynamic imports may not be detected

**Q: Images aren't being detected.**
A: 
1. Verify your `-a` (alias) or `-r` (root-referenced) flag matches how images are referenced in code
2. Check if the image path patterns match what's in your code
3. Try `--clear-cache` to rebuild the image graph
4. Ensure the `<rootPath>` argument includes all directories that reference images

**Q: Scan is slow on large projects.**
A: 
- First scan is always slower - it builds the complete dependency graph
- Subsequent scans use caching and are much faster (only changed files are re-analyzed)
- The enhanced file finding mechanism with proper config ensures accurate and efficient resolution even in large codebases
- Exclude more directories with `-e` flag to speed up scans
- Consider scanning smaller subdirectories separately
- Ensure your `codeAlias` config is correct - incorrect config can cause unnecessary resolution attempts

**Q: How do I know if my configuration is correct?**
A:
- After `qleaner init`, verify `codeAlias` in `qleaner.config.json` matches your project's config file
- Run a test scan: `qleaner scan src --dry-run` and check if files you know are used are incorrectly reported as unused
- If you see false positives, check:
  1. Does your `jsconfig.json`/`tsconfig.json` exist and have correct `paths` configuration?
  2. Is `codeAlias` pointing to the right file?
  3. If using manual `paths`, do the patterns match your import statements?
- For monorepos, you may need `tsconfig.app.json` or `tsconfig.base.json` instead of `tsconfig.json`

**Q: How do I undo deletions?**
A: 
- If you used "Move to `.trash`", files are safely stored in `.trash` directory in your project root
- Permanently deleted files can be restored from git if you're using version control
- Always test after deletions before emptying `.trash`

**Q: `list` command shows no results but I know the dependency is used.**
A: 
- Make sure you ran `qleaner scan` (with `-p` or `path` in config) first to generate the cache
- The dependency path might need to match exactly - try partial paths (e.g., `react` instead of `react/dist/react.production.min.js`)
- Check if the dependency is in `node_modules` or a local file path

**Q: `dep` command shows dependencies I know are used.**
A: 
- Some dependencies might be used only in config files (webpack.config.js, etc.) which aren't scanned
- Dynamic requires/imports might not be detected
- Check if they're actually used with `qleaner list <dependency-name>`

---

**Made with love for clean codebases**
