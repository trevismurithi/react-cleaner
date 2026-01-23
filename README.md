# Qleaner

**Qleaner** (v1.2.0) is a powerful CLI tool for analyzing and cleaning up React, TypeScript, and JavaScript projects. It helps you identify unused files, images, dependencies, and dead code to optimize your bundle size and maintain a clean codebase.

## Features

- **Find Unused Code Files** - Identify files that aren't imported or used anywhere
- **Find Unused Images** - Detect image assets that are never referenced in your code
- **Unused Dependencies** - Discover npm/yarn packages that are installed but not used
- **Dead Image Links** - Find image references in code that point to non-existent files
- **Project Summary** - Get comprehensive statistics about your codebase
- **File Size Analysis** - Identify the largest files and potential optimization targets
- **Dependency Analysis** - See which files have heavy dependencies and hotspots
- **Smart Caching** - Fast incremental scans with intelligent cache invalidation
- **Dry-Run Mode** - Preview what would be deleted without actually deleting anything
- **Interactive Deletion** - Choose to delete files permanently or move them to `.trash`
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

## Quick Start

### 1. Initialize Configuration

**IMPORTANT:** Proper configuration is critical for Qleaner to accurately find and resolve files in your project, especially for large codebases. Take time to get this right!

First, set up Qleaner for your project:

```bash
qleaner init
```

This interactive command will ask you:
1. **Package manager** (npm/yarn/pnpm)
2. **Image path resolution** - How you reference images (relative paths vs absolute paths from public/)
3. **Framework type** (React or Next.js) - Sets appropriate entry points
4. **Configuration file for path aliases** - **This is crucial!** Select which config file Qleaner should use to resolve import aliases:
   - `tsconfig.json` (most common for TypeScript projects)
   - `jsconfig.json` (for JavaScript projects)
   - `tsconfig.app.json` (for monorepos or specific app configs)
   - `tsconfig.base.json` (for monorepo base configs)
   - `none` (if you don't use path aliases or want to configure manually)

**Why this matters:** Qleaner uses your project's `jsconfig.json` or `tsconfig.json` file to understand how import paths are resolved. This enables accurate file finding even in large codebases with complex path aliases (e.g., `@/components`, `~/utils`, etc.). Selecting the correct config file ensures Qleaner can properly trace dependencies and find all file references.

**If you don't use jsconfig/tsconfig:** Select "none" during initialization, then manually add your path aliases to the `paths` field in `qleaner.config.json` (see Configuration section below).

This creates a `qleaner.config.json` file in your project root with sensible defaults.

### 2. Scan for Unused Code Files

Scan a directory for unused files:

```bash
# Dry run (recommended first time)
qleaner scan src --dry-run

# Actual scan (will prompt for deletion)
qleaner scan src
```

### 3. Scan for Unused Images

Find images that aren't referenced in your code:

```bash
# Scan images in public/images against code in src
qleaner image public/images src --dry-run

# With alias paths (e.g., @/assets/images/logo.png)
qleaner image public/images src -a --dry-run

# With root-referenced paths (e.g., /images/logo.png)
qleaner image public/images src -r --dry-run
```

## Commands

### `qleaner init`

Initialize Qleaner with an interactive configuration wizard. This command asks you a series of questions to set up Qleaner for your project and creates a `qleaner.config.json` file in your project root with sensible defaults.

**Configuration is Critical:** Getting the configuration right, especially the jsconfig/tsconfig selection, is essential for Qleaner to accurately find files in large codebases. Incorrect configuration may result in false positives (files reported as unused when they're actually used) or missed dependencies.

**Questions asked:**
1. **Package manager** (npm, yarn, or pnpm)
2. **Image path resolution** - How you reference images:
   - Relative paths (e.g., `./assets/logo.png`)
   - Absolute paths from public/ (e.g., `/images/logo.png`)
3. **Framework type** (React or Next.js) - Determines entry point files
4. **Configuration file for path aliases** - **Most important question!** Select which config file Qleaner should use:
   - `tsconfig.json` - Standard TypeScript configuration
   - `jsconfig.json` - Standard JavaScript configuration  
   - `tsconfig.app.json` - App-specific config (common in monorepos)
   - `tsconfig.base.json` - Base config (common in monorepos)
   - `none` - No config file (use manual path configuration)

**Why the config file matters:**
- Qleaner reads path aliases from your `jsconfig.json` or `tsconfig.json` to resolve imports like `@/components/Button` or `~/utils/helpers`
- This enables accurate dependency tracking even in large projects with complex import structures
- Without the correct config file, Qleaner may not properly resolve aliased imports, leading to incorrect results

**If you don't have a jsconfig/tsconfig file:**
- Select "none" during initialization
- Manually configure path aliases in the `paths` field of `qleaner.config.json` (see Configuration section)
- Example: `"paths": { "@/*": ["./src/*"], "~/*": ["./src/*"] }`

**Examples:**
```bash
# Initialize with interactive prompts
qleaner init

# After initialization, verify your config
cat qleaner.config.json

# Then run your first scan
qleaner scan src --dry-run
```

**Note:** If you already have a `qleaner.config.json` file, this command will prompt you before overwriting it. You can manually edit the config file instead if needed.

### `qleaner scan <path>`

Scan a directory for unused code files.

**Options:**
- `-e, --exclude-dir <dir...>` - Exclude directories from scan (e.g., `-e node_modules dist`)
- `-f, --exclude-file <file...>` - Exclude specific files by name (e.g., `-f config.js`)
- `-F, --exclude-file-print <files...>` - Scan but don't report as unused (for entry points)
- `-x, --exclude-extensions <extensions...>` - Exclude file extensions (e.g., `-x test.tsx test.ts`)
- `-t, --table` - Display results in a formatted table
- `-d, --dry-run` - Preview deletions without actually deleting
- `-C, --clear-cache` - Clear cache before scanning (useful after major changes)

**Examples:**
```bash
# Basic scan (will prompt for deletion if unused files found)
qleaner scan src

# Dry run with table output (recommended first time)
qleaner scan src --dry-run --table

# Exclude test files and multiple directories
qleaner scan src -x test.tsx test.ts test.js test.jsx -e node_modules dist build

# Exclude specific files from being reported as unused (entry points)
qleaner scan src -F index.tsx main.tsx app.tsx

# Clear cache and perform fresh scan
qleaner scan src --clear-cache

# Comprehensive scan with multiple exclusions
qleaner scan src --exclude-dir node_modules dist build --exclude-extensions test.tsx test.ts --table
```

### `qleaner image <directory> <rootPath>`

Scan for unused images by comparing image files against references in your code. Detects images (png, jpg, jpeg, svg, gif, webp) that exist in your assets directory but are never referenced in your source code.

**Arguments:**
- `<directory>` - Directory containing image files to scan (e.g., `public/images`, `src/assets`)
- `<rootPath>` - Root directory of your source code that references images (e.g., `src`, `app`)

**Options:**
- `-e, --exclude-dir-assets <dir...>` - Exclude directories from image file scan (can specify multiple)
- `-f, --exclude-file-assets <file...>` - Exclude specific image files by name pattern
- `-E, --exclude-dir-code <dir...>` - Exclude directories when scanning code for image references (e.g., `-E node_modules dist`)
- `-S, --exclude-file-code <file...>` - Exclude specific files when scanning code for image references
- `-r, --is-root-folder-referenced` - Images use root-referenced paths (e.g., `/images/logo.png` where `/` is the root)
- `-a, --alias` - Images use alias/import paths (e.g., `@/assets/images/logo.png` or `~/assets/logo.png`)
- `-t, --table` - Display results in a formatted table with columns: Unused Images, In Code, Exists, Size
- `-C, --clear-cache` - Clear cache before scanning (recommended after major code changes)
- `-H, --hide-not-found-images` - Hide images referenced in code but not found on disk (dead links)
- `-d, --dry-run` - Preview deletions without actually deleting (skips deletion prompt)

**Important:** Either `-r` (root-referenced) or `-a` (alias) must be set, but not both. They cannot have the same value.

**Examples:**
```bash
# Basic image scan with root-referenced paths (e.g., /images/logo.png)
qleaner image public/images src -r

# With alias paths (e.g., @/assets/images/logo.png)
qleaner image src/assets/images src -a

# Dry run with table format
qleaner image public/images src -r --dry-run --table

# Hide dead image links and use table format
qleaner image public/images src -r -H -t

# Exclude directories from code scan
qleaner image public/images src -r -E node_modules dist test

# Exclude specific directories from asset scan
qleaner image src/assets src -a -e icons fonts

# Clear cache and rescan
qleaner image public/images src -r --clear-cache

# Comprehensive scan with all options
qleaner image src/assets src -a --exclude-dir-code node_modules dist --hide-not-found-images --table --dry-run
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

List the files by dependency. Searches through your dependency graph to find all files that import or use the specified dependency (module, package, or file path).

**CLI Reference:** Lines 32-39 of `bin/cli.js`

**Description:** List the files by dependency

**Arguments:**
- `<dependency>` - The dependency to list the files by (e.g., `react-router`, `lodash`, `./utils/helpers`)

**Options:**
- `-t, --table` - Display results in a table format

**Examples:**
```bash
# List files using react-router
qleaner list react-router

# List files using a local module (partial path matching)
qleaner list ./utils/helpers

# List files using lodash with table format
qleaner list lodash --table

# Find files using a specific package
qleaner list axios
```

**Note:** Requires a cache file. Run `qleaner scan <path>` first to generate the dependency graph.

### `qleaner dep`

List the unused dependencies. Analyzes your `package.json` dependencies and compares them against the dependency graph to identify packages that are installed but never imported or used in your codebase.

**CLI Reference:** Lines 40-49 of `bin/cli.js`

**Description:** List the unused dependencies

**Options:**
- `-d, --directory <directory>` - The directory to list the unused dependencies from (defaults to current directory)
- `-t, --table` - Display results in a table format

**Examples:**
```bash
# Find unused dependencies in current directory
qleaner dep

# Check dependencies in a specific package/monorepo directory
qleaner dep -d ./packages/my-package

# Display results in table format
qleaner dep --table

# Combined: specific directory with table
qleaner dep -d ./src --table
```

**Note:** Requires a cache file. Run `qleaner scan <path>` first to generate the dependency graph. Only analyzes `dependencies` in package.json, not `devDependencies`.

### `qleaner summary`

Get comprehensive project statistics and insights. Provides overview of imports, files, and project structure.

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

**Note:** Requires a cache file. Run `qleaner scan <path>` to generate code cache and/or `qleaner image <dir> <root>` to generate image cache first.

## Configuration

Qleaner can be configured via `qleaner.config.json` or CLI flags. CLI flags always override config file values.

### Configuration File Structure

```json
{
  "codeAlias": "tsconfig.json",
  "paths": {},
  "packageManager": "yarn",
  "excludeDir": ["node_modules", "dist", "build", ".next"],
  "excludeFile": ["payload-types.ts"],
  "excludeExtensions": [".test.tsx", ".test.ts"],
  "excludeFilePrint": ["index.js", "index.tsx", "main.js"],
  "excludeDirAssets": [],
  "excludeFileAssets": [],
  "excludeDirCode": ["node_modules", "dist"],
  "excludeFileCode": [],
  "isRootFolderReferenced": true,
  "alias": false
}
```

### Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `codeAlias` | string \| null | **Critical!** Config file to use for path alias resolution. Options: `"tsconfig.json"`, `"jsconfig.json"`, `"tsconfig.app.json"`, `"tsconfig.base.json"`, or `null` for manual configuration. Qleaner reads path aliases from this file to resolve imports (e.g., `@/components`, `~/utils`). |
| `paths` | object | **Manual path aliases** (only used if `codeAlias` is `null`). Object mapping alias patterns to file paths. Example: `{ "@/*": ["./src/*"], "~/*": ["./src/*"] }`. If `codeAlias` is set, this field is ignored and paths are read from the config file instead. |
| `packageManager` | string | Package manager used: `npm`, `yarn`, or `pnpm` |
| `excludeDir` | string[] | Directories to exclude from code scans |
| `excludeFile` | string[] | Files to exclude by name from code scans |
| `excludeExtensions` | string[] | File extensions to exclude (e.g., `["test.tsx"]`) |
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

**When to Clear Cache:**
- After major refactoring
- When dependencies change significantly
- If you get unexpected results

```bash
# Clear cache and rescan
qleaner scan src --clear-cache
```

## File Deletion

When you run a scan without `--dry-run`, Qleaner will prompt you to:

1. **Select files to delete** - Choose from a list of unused files
2. **Choose deletion method:**
   - **Move to `.trash`** - Safely moves files to a `.trash` directory (recommended)
   - **Delete permanently** - Permanently removes files

**Recommended Workflow:**
1. Run with `--dry-run` first to see what would be deleted
2. Review the results carefully
3. Run without `--dry-run` and select files to delete
4. Choose "Move to `.trash`" to keep a backup
5. Test your application
6. Empty `.trash` when confident

## How It Works

### Code Analysis
1. **File Discovery** - Uses `fast-glob` to find all code files matching patterns with intelligent exclusion handling
2. **Path Alias Resolution** - Reads path aliases from your `jsconfig.json` or `tsconfig.json` (or manual `paths` config) to understand how imports are resolved. This enables accurate file finding even in large codebases with complex import structures.
3. **AST Parsing** - Parses JavaScript/TypeScript with Babel to extract imports and exports from code files
4. **Module Resolution** - Uses `enhanced-resolve` with your project's path aliases to resolve import paths accurately. Supports:
   - Path aliases (e.g., `@/components`, `~/utils`)
   - Relative imports (`./component`, `../utils`)
   - Node modules (`react`, `lodash`)
   - Directory index files (automatically resolves `./components` to `./components/index.ts`)
5. **Dependency Graph** - Builds a comprehensive graph of file dependencies, tracking both imports and exports
6. **Unused Detection** - Identifies files with no incoming imports (except entry points defined in `excludeFilePrint`)

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
qleaner image public/images src -r --dry-run --table

# 6. Check for unused dependencies
qleaner dep --table

# 7. Get project summary
qleaner summary

# 8. Get largest files report
qleaner summary --largest-files

# 9. Get dependency analysis
qleaner summary --dependencies

# 10. Once confident with results, run actual scans and delete files
qleaner scan src
qleaner image public/images src -r
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

Some commands require cache files from other commands:

| Command | Requires Cache From |
|---------|-------------------|
| `qleaner list <dependency>` | `qleaner scan <path>` |
| `qleaner dep` | `qleaner scan <path>` |
| `qleaner summary` | `qleaner scan <path>` and/or `qleaner image <dir> <root>` |

**Best Practice:** Run `qleaner scan src` first, then run other commands that depend on the cache.

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
- Make sure you ran `qleaner scan <path>` first to generate the cache
- The dependency path might need to match exactly - try partial paths (e.g., `react` instead of `react/dist/react.production.min.js`)
- Check if the dependency is in `node_modules` or a local file path

**Q: `dep` command shows dependencies I know are used.**
A: 
- Some dependencies might be used only in config files (webpack.config.js, etc.) which aren't scanned
- Dynamic requires/imports might not be detected
- Check if they're actually used with `qleaner list <dependency-name>`

---

**Made with love for clean codebases**
