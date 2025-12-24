# Qleaner

A powerful CLI tool to analyze and clean up your React codebase by finding unused files and images, providing project insights, and analyzing dependencies.

## Features

- 🔍 **Scan for unused files**: Identify files that are not imported anywhere in your project
- 🖼️ **Scan for unused images**: Find image files that are not referenced in your codebase
- 📊 **Project summary**: Get comprehensive project insights including file counts, unused files/images, largest files, dependencies, and more
- 📋 **Dependency analysis**: Analyze import patterns and identify files with heavy or light dependencies
- 📈 **File size analysis**: Identify largest files and potential optimization opportunities
- 📊 **Table output**: Display results in formatted tables for better readability
- ⚙️ **Flexible configuration**: Exclude directories and files from scanning via command-line options or configuration file (`qleaner.config.json`)
- 🚀 **Fast performance**: Efficient file scanning across large codebases with intelligent caching
- 💪 **TypeScript support**: Works with TypeScript, JavaScript, JSX, and TSX files
- 🧪 **Dry run mode**: Preview what would be deleted without actually deleting files
- 💾 **Smart caching**: Caches scan results for faster subsequent runs (automatically invalidates on file changes)
- 🎨 **CSS and styled-components support**: Detects images used in CSS files and styled-components
- 🔧 **Configuration file**: Use `qleaner init` to create a `qleaner.config.json` file with default settings for your project

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

### Initialize Configuration

Create a `qleaner.config.json` file in your project root to configure default settings:

```bash
qleaner init
```

This creates a configuration file with default settings for exclusions and image scanning options. You can then modify `qleaner.config.json` to customize your settings.

### Project Summary

Get a comprehensive summary of your project including file counts, unused files/images, and dependencies:

```bash
qleaner summary [options]
```

**Options:**
- `-l, --largest-files` - List the largest files in the project
- `-d, --dependencies` - List the dependencies in the project

**Examples:**

```bash
# Get project summary (default)
qleaner summary

# List the largest files
qleaner summary --largest-files

# List dependencies
qleaner summary --dependencies
```

**Important:** Before viewing the summary, make sure to run a fresh scan with `--clear-cache` to ensure accurate results. The summary reads from the cache, so outdated cache data will show outdated results.

### Scan for Unused Files

Find files that are not imported anywhere in your project:

```bash
qleaner scan <path> [options]
```

**Options:**
- `-e, --exclude-dir <dir...>` - Exclude directories from the scan
- `-f, --exclude-file <file...>` - Exclude files from the scan
- `-F, --exclude-file-print <files...>` - Scan but don't print the excluded files
- `-x, --exclude-extensions <extensions...>` - Exclude file extensions from the scan (e.g., test.tsx, test.ts, test.js, test.jsx)
- `-t, --table` - Display results in a formatted table
- `-d, --dry-run` - Show what would be deleted without actually deleting (skips prompt)
- `-C, --clear-cache` - Clear the cache before scanning (recommended after making code changes)

**Examples:**

```bash
# Scan src directory for unused files
qleaner scan src

# Display unused files in a table format
qleaner scan src --table

# Scan excluding test directories
qleaner scan src -e __tests__ __mocks__ test

# Scan excluding specific file patterns
qleaner scan src -f "**/*.test.js" "**/*.stories.js"

# Scan excluding file extensions
qleaner scan src -x test.tsx test.ts test.js test.jsx

# Scan with multiple exclusions
qleaner scan src -e node_modules dist -f "**/*.config.js"

# Scan with table output and exclusions
qleaner scan src --table -e __tests__ dist -f "**/*.config.js"

# Dry run - preview what would be deleted without deleting
qleaner scan src --dry-run

# Dry run with table output
qleaner scan src --dry-run --table

# Clear cache and scan (recommended after making code changes)
qleaner scan src --clear-cache

# Clear cache with dry run
qleaner scan src --clear-cache --dry-run
```

### Scan for Unused Images

Find image files that are not referenced anywhere in your codebase:

```bash
qleaner image <directory> <rootPath> [options]
```

**Arguments:**
- `<directory>` - The path to the directory containing image files to scan
- `<rootPath>` - The root path to the project code that utilizes the images

**Options:**
- `-e, --exclude-dir-assets <dir...>` - Exclude directories from the asset scan
- `-f, --exclude-file-assets <file...>` - Exclude files from the asset scan
- `-E, --exclude-dir-code <dir...>` - Exclude directories from the code scan
- `-S, --exclude-file-code <file...>` - Exclude files from the code scan
- `-r, --is-root-folder-referenced` - Is the root folder referenced in the image path (e.g., `/img/a.png` where `img` is the root folder)
- `-a, --alias` - Is the alias referenced in the image path (e.g., `@/assets/images/a.png`)
- `-t, --table` - Display results in a formatted table
- `-d, --dry-run` - Show what would be deleted without actually deleting (skips prompt)
- `-C, --clear-cache` - Clear the cache before scanning (recommended after making code changes)
- `-H, --hide-not-found-images` - Hide images shown in code but not found in the image directory

**Examples:**

```bash
# Scan for unused images in public/images directory
qleaner image public/images src

# Display unused images in a table format
qleaner image public/images src --table

# Scan with exclusions for assets
qleaner image public/images src -e public/images/icons

# Scan with exclusions for code files
qleaner image public/images src -E __tests__ node_modules

# Scan with root folder reference pattern
qleaner image public/images src -r

# Scan with alias pattern
qleaner image public/images src -a

# Hide not-found images from results
qleaner image public/images src --hide-not-found-images

# Dry run - preview what would be deleted
qleaner image public/images src --dry-run

# Dry run with table output
qleaner image public/images src --dry-run --table

# Scan with multiple exclusions
qleaner image public/images src -e public/images/icons -E __tests__ -S "**/*.test.*"

# Clear cache and scan
qleaner image public/images src --clear-cache
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
   - Unused files table shows: Unused file paths with sizes (or "Would Delete" in dry run mode)
   - Unused images table shows: Unused image paths with information about whether they exist and are referenced in code (or "Would Delete" in dry run mode)
   - Summary tables show: Project statistics, largest files, dependencies, and more

## How It Works

### File Scanning (scan)

1. **File Discovery**: Recursively finds all `.tsx`, `.ts`, `.js`, and `.jsx` files in the specified directory
2. **Caching**: Checks cache for previously scanned files. Files that haven't changed are skipped for faster performance
3. **Import Extraction**: Parses files using Babel AST and extracts all import statements (only for changed files or cache misses)
4. **Module Resolution**: Uses enhanced-resolve to properly resolve import paths (supports path aliases like `@/` and `~/`)
5. **Analysis**: Compares file paths with resolved import paths to identify unused files
6. **Cache Update**: Saves scan results to cache for faster subsequent runs
7. **Reporting**: Outputs the results in standard or table format based on your preferences
8. **Safe Deletion**: In dry run mode, shows what would be deleted without making changes. In normal mode, prompts for confirmation before deletion

### Image Scanning (image)

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
- 📊 **Code analysis**: Understand import patterns and dependencies in your codebase through the summary command
- 🔍 **Project audit**: Identify orphaned files and assets that may have been forgotten
- 📦 **Bundle optimization**: Find files and images that can be removed to reduce bundle size
- 📈 **Project insights**: Analyze largest files, dependency patterns, and project statistics
- 🎯 **Maintenance**: Keep your codebase clean and maintainable

## Configuration

Qleaner supports configuration through both command-line options and a configuration file (`qleaner.config.json`). Use `qleaner init` to create a default configuration file.

### Configuration File

The `qleaner.config.json` file allows you to set default options that will be merged with command-line options. Command-line options take precedence over configuration file options.

**Configuration options:**
- `excludeDir` - Array of directories to exclude from scans
- `excludeFile` - Array of file patterns to exclude from scans
- `excludeExtensions` - Array of file extensions to exclude (e.g., `["test.tsx", "test.ts"]`)
- `excludeFilePrint` - Array of files to scan but not print in results
- `excludeDirAssets` - Array of directories to exclude from asset scans
- `excludeFileAssets` - Array of file patterns to exclude from asset scans
- `excludeDirCode` - Array of directories to exclude from code scans
- `excludeFileCode` - Array of file patterns to exclude from code scans
- `isRootFolderReferenced` - Boolean indicating if root folder is referenced in image paths
- `alias` - Boolean indicating if aliases are used in image paths

**Common exclusions:**
- Test files: `-f "**/*.test.*" "**/*.spec.*"` or `excludeExtensions: ["test.tsx", "test.ts"]`
- Storybook files: `-f "**/*.stories.*"`
- Test directories: `-e __tests__ __mocks__ test`
- Build outputs: `-e dist build .next`
- Configuration files: `-f "**/*.config.*"`
- Third-party code: `-e node_modules vendor`

**Example configuration file:**
```json
{
  "excludeDir": ["node_modules", "dist", "build"],
  "excludeFile": [],
  "excludeExtensions": ["test.tsx", "test.ts"],
  "excludeFilePrint": ["page.tsx", "route.ts", "layout.tsx"],
  "isRootFolderReferenced": false,
  "alias": true
}
```

## Tips and Best Practices

1. **Start with a small scope**: Begin by scanning a specific directory before scanning the entire project
2. **Use dry run first**: Always run with `--dry-run` first to preview what would be deleted before actually deleting files
3. **Clear cache before summary**: Before running `qleaner summary`, always run a fresh scan with `--clear-cache` to ensure accurate results. The summary reads from the cache, so outdated cache data will show outdated results
4. **Clear cache after code changes**: If you've made changes to your codebase (added/removed files, changed imports), use `--clear-cache` to ensure accurate results. The cache automatically invalidates when files change, but clearing it manually ensures a fresh scan
5. **Use exclusions**: Exclude test files and build outputs when scanning for unused files
6. **Review before deleting**: Always review the unused files list before removing them - some files might be used dynamically (e.g., through dynamic imports, configuration files, or asset references)
7. **Use table format**: The table format is easier to read for large results
8. **Combine options**: Use multiple flags together for comprehensive analysis
9. **Check dynamic imports**: Files imported using dynamic imports (`import()`) may appear as unused but are actually needed
10. **Image scanning setup**: For best results when scanning images, ensure images are located in one central location and use a uniform reference pattern (either aliases or root folder references consistently)
11. **Index file references**: Files or images referenced through index files (e.g., `/folderA/folderB` where `folderB` contains index files with exports) may be difficult to scan accurately. For proper scanning, ensure the full path to the actual file is used in references

## Important Notes

⚠️ **Warning**: Always review files before deletion. Some files might be:
- Used dynamically (dynamic imports)
- Referenced in configuration files
- Required for build processes
- Used as entry points that aren't directly imported

⚠️ **Generated/Compiled Code**: Scans do **not** work on generated or compiled code (e.g., `build`, `dist`, `.next` directories). Always scan your source code, not the compiled output. Exclude build directories from scans.

⚠️ **Image Scanning Requirements**: For accurate image scanning results:
- Images should be located in **one central location** (single directory structure)
- Use a **uniform reference pattern** throughout your codebase - either consistently use aliases (e.g., `@/assets/images/`) or root folder references (e.g., `/img/`), but not both mixed
- The tool supports both patterns, but mixing them may lead to incomplete detection

⚠️ **Index File Limitations**: Files or images referenced via index files (e.g., `/folderA/folderB` where `folderB` contains index files with exports) might be difficult to scan accurately. The tool may not always detect references when the path points to a folder containing an index file rather than the full path to the actual file. For proper scanning, ensure the full path to where the file is located is used in references (e.g., `/folderA/folderB/Component.tsx` instead of `/folderA/folderB`).

💡 **Tip**: Always use `--dry-run` first to preview what would be deleted. This is especially important in CI/CD pipelines or when scanning large codebases.

💡 **Summary Command**: Before running `qleaner summary`, always run a fresh scan with `--clear-cache` to ensure the summary shows accurate, up-to-date results. The summary reads from the cache, so outdated cache data will produce outdated summaries.

💾 **Cache Management**: Qleaner uses intelligent caching to speed up scans. The cache automatically detects file changes via content hashing. However, if you've made significant changes to your codebase structure or want to ensure a completely fresh scan, use `--clear-cache` before scanning. This is particularly useful:
- After major refactoring
- When files have been moved or renamed
- When you want to ensure the most up-to-date results
- Before running the summary command
- In CI/CD pipelines where you want consistent, fresh scans

## Requirements

- Node.js 14+ 
- Yarn or npm

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Version

Current version: 1.0.34
