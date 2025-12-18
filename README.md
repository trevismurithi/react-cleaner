# Qleaner

A powerful CLI tool to analyze and clean up your React codebase by finding unused files and listing all imports.

## Features

- 🔍 **Scan for unused files**: Identify files that are not imported anywhere in your project
- 🖼️ **Scan for unused images**: Find image files that are not referenced in your codebase
- 📋 **List all imports**: Get a complete list of all import statements in your codebase with file locations
- 🎯 **File listing**: List all files in your project
- 📊 **Table output**: Display results in formatted tables for better readability
- ⚙️ **Flexible configuration**: Exclude directories and files from scanning
- 🚀 **Fast performance**: Efficient file scanning across large codebases with intelligent caching
- 💪 **TypeScript support**: Works with TypeScript, JavaScript, JSX, and TSX files
- 🧪 **Dry run mode**: Preview what would be deleted without actually deleting files
- 💾 **Smart caching**: Caches scan results for faster subsequent runs (automatically invalidates on file changes)
- 📊 **Dependency graph**: Builds a complete dependency graph tracking import relationships between files
- ⚡ **Incremental scanning**: Only processes files that have changed since the last scan
- 🎨 **CSS and styled-components support**: Detects images used in CSS files and styled-components

## Installation

```bash
# Install globally
npm install -g qleaner

# Or use with npx
npx qleaner

# Or install locally
yarn add qleaner
```

## Usage

### List Imports and Files

List all imports and files in your project:

```bash
qleaner qlean-list <path> [options]
```

**Options:**
- `-l, --list-files` - List all the files in the project
- `-i, --list-imports` - List all the imports in the project
- `-e, --exclude-dir <dir...>` - Exclude directories from the scan
- `-f, --exclude-file <file...>` - Exclude files from the scan
- `-F, --exclude-file-print <file...>` - Do not print the excluded files
- `-t, --table` - Display results in a formatted table

**Examples:**

```bash
# List all files in src directory
qleaner qlean-list src --list-files

# List all imports in src directory
qleaner qlean-list src --list-imports

# List both files and imports in table format
qleaner qlean-list src --list-files --list-imports --table

# List files excluding node_modules and dist
qleaner qlean-list src --list-files -e node_modules dist

# List imports excluding specific files
qleaner qlean-list src --list-imports -f "**/*.test.js" "**/*.spec.js"

# List with table output
qleaner qlean-list src --list-files --list-imports --table
```

### Scan for Unused Files

Find files that are not imported anywhere in your project:

```bash
qleaner qlean-scan <path> [options]
```

**Options:**
- `-e, --exclude-dir <dir...>` - Exclude directories from the scan
- `-f, --exclude-file <file...>` - Exclude files from the scan
- `-F, --exclude-file-print <files...>` - Do not print the excluded files
- `-t, --table` - Display results in a formatted table
- `-d, --dry-run` - Show what would be deleted without actually deleting (skips prompt)
- `-C, --clear-cache` - Clear the cache before scanning (use when code changes have been made)

**Examples:**

```bash
# Scan src directory for unused files
qleaner qlean-scan src

# Display unused files in a table format
qleaner qlean-scan src --table

# Scan excluding test directories
qleaner qlean-scan src -e __tests__ __mocks__ test

# Scan excluding specific file patterns
qleaner qlean-scan src -f "**/*.test.js" "**/*.stories.js"

# Scan with multiple exclusions
qleaner qlean-scan src -e node_modules dist -f "**/*.config.js"

# Scan with table output and exclusions
qleaner qlean-scan src --table -e __tests__ dist -f "**/*.config.js"

# Dry run - preview what would be deleted without deleting
qleaner qlean-scan src --dry-run

# Dry run with table output
qleaner qlean-scan src --dry-run --table

# Clear cache and scan (recommended after making code changes)
qleaner qlean-scan src --clear-cache

# Clear cache with dry run
qleaner qlean-scan src --clear-cache --dry-run
```

### Scan for Unused Images

Find image files that are not referenced anywhere in your codebase:

```bash
qleaner qlean-image <directory> <rootPath> [options]
```

**Arguments:**
- `<directory>` - The path to the directory containing image files to scan
- `<rootPath>` - The root path to the project code that utilizes the images

**Options:**
- `-e, --exclude-dir-assets <dir...>` - Exclude directories from the asset scan
- `-f, --exclude-file-asset <file...>` - Exclude files from the asset scan
- `-F, --exclude-file-print-asset <files...>` - Scan but don't print the excluded asset files
- `-E, --exclude-dir-code <dir...>` - Exclude directories from the code scan
- `-S, --exclude-file-code <file...>` - Exclude files from the code scan
- `-P, --exclude-file-print-code <files...>` - Scan but don't print the excluded code files
- `-t, --table` - Display results in a formatted table
- `-d, --dry-run` - Show what would be deleted without actually deleting (skips prompt)
- `-C, --clear-cache` - Clear the cache before scanning

**Examples:**

```bash
# Scan for unused images in public/images directory
qleaner qlean-image public/images src

# Display unused images in a table format
qleaner qlean-image public/images src --table

# Scan with exclusions for assets
qleaner qlean-image public/images src -e public/images/icons

# Scan with exclusions for code files
qleaner qlean-image public/images src -E __tests__ node_modules

# Dry run - preview what would be deleted
qleaner qlean-image public/images src --dry-run

# Dry run with table output
qleaner qlean-image public/images src --dry-run --table

# Scan with multiple exclusions
qleaner qlean-image public/images src -e public/images/icons -E __tests__ -S "**/*.test.*"
```

**What it detects:**
- Images imported via `import` statements
- Images required via `require()` calls
- Images used in JSX `src` attributes
- Images in CSS `url()` functions (CSS and SCSS files)
- Images in styled-components and CSS-in-JS template literals
- Images in inline styles (backgroundImage, etc.)
- Images referenced in string literals and template literals

## Output Formats

Qleaner provides two output formats:

1. **Standard output**: Color-coded text output
   - Green for files
   - Yellow for imports
   - Red for unused files
   - Cyan for dry run mode messages

2. **Table output**: Formatted tables with organized columns (use `--table` flag)
   - Import tables show: File, Line, Column, and Import path
   - File tables show: File path
   - Unused files table shows: Unused file paths (or "Would Delete" in dry run mode)
   - Unused images table shows: Unused image paths (or "Would Delete" in dry run mode)

## How It Works

### File Scanning (qlean-scan)

1. **File Discovery**: Recursively finds all `.tsx`, `.ts`, `.js`, and `.jsx` files in the specified directory
2. **Cache Initialization**: Loads the dependency graph from cache (if available) or initializes a new empty graph
3. **Incremental Scanning**: 
   - Calculates content hash (MD5) for each file
   - Only processes files that have changed since the last scan (skips unchanged files for faster performance)
   - Files are checked against cache using content hashing to determine if they need rebuilding
4. **Import Extraction**: Parses changed files using Babel AST and extracts all import statements
5. **Dependency Graph Building**:
   - Creates graph nodes for each file with metadata (hash, size, last modified time)
   - Tracks bidirectional relationships: `imports` (what a file imports) and `importedBy` (what imports a file)
   - Resolves import paths using enhanced-resolve (supports path aliases like `@/` and `~/`)
   - Builds complete dependency relationships between all files
6. **Unused File Detection**: Identifies files with no incoming dependencies (`importedBy.size === 0`) as unused
7. **Cache Persistence**: Saves the complete dependency graph to cache (`unused-check-cache.json`) for faster subsequent runs
8. **Reporting**: Outputs the results in standard or table format based on your preferences
9. **Safe Deletion**: In dry run mode, shows what would be deleted without making changes. In normal mode, prompts for confirmation before deletion

### Image Scanning (qlean-image)

1. **Image Discovery**: Recursively finds all image files (`.png`, `.jpg`, `.jpeg`, `.svg`, `.gif`, `.webp`) in the specified directory
2. **Code Scanning**: Scans all code files (`.js`, `.jsx`, `.ts`, `.tsx`) for image references
3. **Image Detection**: Detects images through multiple methods:
   - Import statements (`import img from './image.png'`)
   - Require calls (`require('./image.png')`)
   - JSX src attributes (`<img src="./image.png" />`)
   - CSS url() functions in CSS/SCSS files
   - Styled-components and CSS-in-JS template literals
   - Inline styles (backgroundImage, etc.)
   - String and template literals containing image paths
4. **Path Normalization**: Normalizes all detected image paths for consistent matching
5. **Analysis**: Compares discovered image files with detected references to identify unused images
6. **Reporting**: Outputs the results in standard or table format
7. **Safe Deletion**: In dry run mode, shows what would be deleted without making changes. In normal mode, prompts for confirmation before deletion

## Supported File Types

**Code files:**
- `.js` - JavaScript files
- `.jsx` - JavaScript React files
- `.ts` - TypeScript files
- `.tsx` - TypeScript React files

**Image files (for qlean-image):**
- `.png` - PNG images
- `.jpg`, `.jpeg` - JPEG images
- `.svg` - SVG images
- `.gif` - GIF images
- `.webp` - WebP images

**CSS files (for image detection):**
- `.css` - CSS files
- `.scss` - SCSS files

## Use Cases

- 🧹 **Code cleanup**: Remove dead code and unused files from your React projects
- 🖼️ **Image cleanup**: Find and remove unused image assets to reduce project size
- 📊 **Code analysis**: Understand import patterns and dependencies in your codebase
- 🔍 **Project audit**: Identify orphaned files and assets that may have been forgotten
- 📦 **Bundle optimization**: Find files and images that can be removed to reduce bundle size
- 🎯 **Maintenance**: Keep your codebase clean and maintainable

## Configuration

You can exclude directories and files from scanning using the command-line options. This is useful for:
- Excluding test files
- Excluding build outputs
- Excluding third-party libraries
- Excluding configuration files

**Common exclusions:**
- Test files: `-f "**/*.test.*" "**/*.spec.*"`
- Storybook files: `-f "**/*.stories.*"`
- Test directories: `-e __tests__ __mocks__ test`
- Build outputs: `-e dist build .next`
- Configuration files: `-f "**/*.config.*"`
- Third-party code: `-e node_modules vendor`

## Tips and Best Practices

1. **Start with a small scope**: Begin by scanning a specific directory before scanning the entire project
2. **Use dry run first**: Always run with `--dry-run` first to preview what would be deleted before actually deleting files
3. **Leverage incremental scanning**: The dependency graph and caching system means subsequent scans are much faster - only changed files are processed. The first scan builds the complete dependency graph, while later scans only update changed files
4. **Clear cache after code changes**: If you've made changes to your codebase (added/removed files, changed imports), use `--clear-cache` to ensure accurate results. The cache automatically invalidates when files change, but clearing it manually ensures a fresh scan
5. **Use exclusions**: Exclude test files and build outputs when scanning for unused files
6. **Review before deleting**: Always review the unused files list before removing them - some files might be used dynamically (e.g., through dynamic imports, configuration files, or asset references)
7. **Use table format**: The table format is easier to read for large results
8. **Combine options**: Use multiple flags together for comprehensive analysis
9. **Check dynamic imports**: Files imported using dynamic imports (`import()`) may appear as unused but are actually needed
10. **Understand the dependency graph**: The tool builds a complete graph of file relationships. Files with no incoming dependencies (`importedBy` is empty) are marked as unused. This provides accurate detection even in complex codebases with deep import chains

## Important Notes

⚠️ **Warning**: Always review files before deletion. Some files might be:
- Used dynamically (dynamic imports)
- Referenced in configuration files
- Required for build processes
- Used as entry points that aren't directly imported

💡 **Tip**: Always use `--dry-run` first to preview what would be deleted. This is especially important in CI/CD pipelines or when scanning large codebases.

💾 **Cache Management**: Qleaner uses intelligent caching with a dependency graph to speed up scans. The system:

- **Content-based caching**: Uses MD5 hashing to detect file changes - only files with modified content are rescanned
- **Dependency graph storage**: Maintains a complete graph of file relationships in `unused-check-cache.json`
- **Incremental updates**: On subsequent scans, only changed files are processed, dramatically reducing scan time
- **Automatic invalidation**: Files are automatically rescanned when their content hash changes
- **Graph persistence**: The dependency graph (including imports and importedBy relationships) is saved and restored between runs

The cache can be cleared using `--clear-cache` when you want a completely fresh scan. This is particularly useful:
- After major refactoring
- When files have been moved or renamed
- When you want to ensure the most up-to-date results
- In CI/CD pipelines where you want consistent, fresh scans
- If you suspect the cache is corrupted or outdated

**Cache file location**: The cache is stored as `unused-check-cache.json` in your project root directory.

## Requirements

- Node.js 14+ 
- Yarn or npm

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Version

Current version: 1.0.27
