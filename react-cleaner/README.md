# Qleaner

A powerful CLI tool to analyze and clean up your React codebase by finding unused files and listing all imports. Built with Node.js and Babel AST parsing.

## Features

- 🔍 **Scan for unused files**: Identify files that are not imported anywhere in your project
- 📋 **List all imports**: Get a complete list of all import statements in your codebase
- 🎯 **File listing**: List all files in your project
- ⚙️ **Flexible configuration**: Exclude directories and files from scanning
- 🚀 **Fast performance**: Uses fast-glob for efficient file scanning
- 💪 **TypeScript support**: Works with TypeScript, JavaScript, JSX, and TSX files

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

**Examples:**

```bash
# List all files in src directory
qleaner qlean-list src --list-files

# List all imports in src directory
qleaner qlean-list src --list-imports

# List files excluding node_modules and dist
qleaner qlean-list src --list-files -e node_modules dist

# List imports excluding specific files
qleaner qlean-list src --list-imports -f "**/*.test.js" "**/*.spec.js"
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

**Examples:**

```bash
# Scan src directory for unused files
qleaner qlean-scan src

# Scan excluding test directories
qleaner qlean-scan src -e __tests__ __mocks__ test

# Scan excluding specific file patterns
qleaner qlean-scan src -f "**/*.test.js" "**/*.stories.js"

# Scan with multiple exclusions
qleaner qlean-scan src -e node_modules dist -f "**/*.config.js"
```

## How It Works

1. **File Discovery**: Uses `fast-glob` to recursively find all `.tsx`, `.ts`, `.js`, and `.jsx` files in the specified directory
2. **AST Parsing**: Uses Babel parser to parse files and extract import statements
3. **Analysis**: Compares file paths with import paths to identify unused files
4. **Reporting**: Outputs the results based on the selected command and options

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

## Configuration

You can exclude directories and files from scanning using the command-line options. This is useful for:
- Excluding test files
- Excluding build outputs
- Excluding third-party libraries
- Excluding configuration files

## Requirements

- Node.js 14+ 
- Yarn or npm

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Version

Current version: 1.0.9
