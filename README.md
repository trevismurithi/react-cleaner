# Qleaner

A powerful CLI tool to analyze and clean up your React codebase by finding unused files and listing all imports.

## Features

- 🔍 **Scan for unused files**: Identify files that are not imported anywhere in your project
- 📋 **List all imports**: Get a complete list of all import statements in your codebase with file locations
- 🎯 **File listing**: List all files in your project
- 📊 **Table output**: Display results in formatted tables for better readability
- ⚙️ **Flexible configuration**: Exclude directories and files from scanning
- 🚀 **Fast performance**: Efficient file scanning across large codebases with intelligent caching
- 💪 **TypeScript support**: Works with TypeScript, JavaScript, JSX, and TSX files
- 🧪 **Dry run mode**: Preview what would be deleted without actually deleting files
- 💾 **Smart caching**: Caches scan results for faster subsequent runs (automatically invalidates on file changes)

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

## How It Works

1. **File Discovery**: Recursively finds all `.tsx`, `.ts`, `.js`, and `.jsx` files in the specified directory
2. **Caching**: Checks cache for previously scanned files. Files that haven't changed are skipped for faster performance
3. **Import Extraction**: Parses files using Babel AST and extracts all import statements (only for changed files or cache misses)
4. **Module Resolution**: Uses enhanced-resolve to properly resolve import paths (supports path aliases like `@/` and `~/`)
5. **Analysis**: Compares file paths with resolved import paths to identify unused files
6. **Cache Update**: Saves scan results to cache for faster subsequent runs
7. **Reporting**: Outputs the results in standard or table format based on your preferences
8. **Safe Deletion**: In dry run mode, shows what would be deleted without making changes. In normal mode, prompts for confirmation before deletion

## Supported File Types

- `.js` - JavaScript files
- `.jsx` - JavaScript React files
- `.ts` - TypeScript files
- `.tsx` - TypeScript React files

## Use Cases

- 🧹 **Code cleanup**: Remove dead code and unused files from your React projects
- 📊 **Code analysis**: Understand import patterns and dependencies in your codebase
- 🔍 **Project audit**: Identify orphaned files that may have been forgotten
- 📦 **Bundle optimization**: Find files that can be removed to reduce bundle size
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
3. **Clear cache after code changes**: If you've made changes to your codebase (added/removed files, changed imports), use `--clear-cache` to ensure accurate results. The cache automatically invalidates when files change, but clearing it manually ensures a fresh scan
4. **Use exclusions**: Exclude test files and build outputs when scanning for unused files
5. **Review before deleting**: Always review the unused files list before removing them - some files might be used dynamically (e.g., through dynamic imports, configuration files, or asset references)
6. **Use table format**: The table format is easier to read for large results
7. **Combine options**: Use multiple flags together for comprehensive analysis
8. **Check dynamic imports**: Files imported using dynamic imports (`import()`) may appear as unused but are actually needed

## Important Notes

⚠️ **Warning**: Always review files before deletion. Some files might be:
- Used dynamically (dynamic imports)
- Referenced in configuration files
- Required for build processes
- Used as entry points that aren't directly imported

💡 **Tip**: Always use `--dry-run` first to preview what would be deleted. This is especially important in CI/CD pipelines or when scanning large codebases.

💾 **Cache Management**: Qleaner uses intelligent caching to speed up scans. The cache automatically detects file changes via content hashing. However, if you've made significant changes to your codebase structure or want to ensure a completely fresh scan, use `--clear-cache` before scanning. This is particularly useful:
- After major refactoring
- When files have been moved or renamed
- When you want to ensure the most up-to-date results
- In CI/CD pipelines where you want consistent, fresh scans

## Requirements

- Node.js 14+ 
- Yarn or npm

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Version

Current version: 1.0.13
