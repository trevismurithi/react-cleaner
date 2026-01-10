# Qleaner

Qleaner is a safe, fast CLI that finds unused code files and image assets in JavaScript and TypeScript projects (React-ready). It helps you audit and clean large repositories by reporting unused/orphaned files, image dead-links, dependency hotspots, and large-file warnings — with a dry-run mode so you never delete by accident.

**Key points:**

- **Safe first**: Preview deletions using `--dry-run` before removing anything.
- **Configurable**: Use `qleaner.config.json` or CLI flags to fine-tune scans.
- **Fast**: Uses caching and incremental analysis for large repos.

## Project metadata

- **Package name:** qleaner
- **Version:** 1.2.0
- **Executable:** bin/cli.js
- **Repository:** https://github.com/trevismurithi/react-cleaner

## Installation

Install globally or run with `npx`:

```bash
# Install globally
npm install -g qleaner

# Or run without installing
npx qleaner

# Or add locally to a project
yarn add qleaner --dev
```

## Quick Usage

Initialize a default configuration in your project root:

```bash
qleaner init
```

Scan for unused files (dry run recommended):

```bash
qleaner scan <path> --dry-run
```

Scan for unused images:

```bash
qleaner image <images-directory> <source-root> --dry-run
```

List files by dependency (e.g., list files that depend on a package):

```bash
qleaner list <dependency> [--table]
```

List unused dependencies in a directory:

```bash
qleaner dep --directory <directory> [--table]
```

Show a project summary (run a fresh scan with `--clear-cache` first for accurate numbers):

```bash
qleaner summary --largest-files --dependencies
```

Run the CLI locally from this repo:

```bash
node ./bin/cli.js <command>
```

## Configuration

Qleaner reads `qleaner.config.json` from the project root (CLI flags override file values). The repo includes a `qleaner.config.json` with sensible defaults (excludes `node_modules`, build outputs, and common generated folders). Important fields include:

- `packageManager` — e.g., `yarn` or `npm`
- `excludeDir`, `excludeDirCode`, `excludeDirAssets` — directories to skip
- `excludeFile`, `excludeFileCode`, `excludeFileAssets` — files to skip
- `excludeExtensions` — extensions to ignore (test files, etc.)
- `excludeFilePrint` — files to scan but not print (entry points/index files)
- `isRootFolderReferenced` — whether image paths reference the project root
- `alias` — whether alias import patterns (e.g., `@/`) are used

Example snippet:

```json
{
  "packageManager": "yarn",
  "excludeDir": ["node_modules","dist","build",".next"],
  "isRootFolderReferenced": true,
  "alias": false
}
```

## Commands & Options (high level)

- `qleaner init` — write a default `qleaner.config.json`
- `qleaner list <dependency>` — list files that depend on a given dependency
  - Options: `-t, --table` — display results in a table
- `qleaner dep` — list unused dependencies
  - Options: `-d, --directory <directory>` — directory to check (defaults to `process.cwd()`), `-t, --table`
- `qleaner summary` — project statistics, largest files, dependency hotspots
  - Options: `-l, --largest-files`, `-d, --dependencies`
- `qleaner scan <path>` — find unused code files
  - Options:
    - `-e, --exclude-dir <dir...>` — exclude directories from the scan
    - `-f, --exclude-file <file...>` — exclude files from the scan (file name match)
    - `-F, --exclude-file-print <files...>` — scan but don't print these files (entrypoints/index files)
    - `-x, --exclude-extensions <extensions...>` — exclude file extensions (e.g., `test.tsx`)
    - `-t, --table` — print results in a table
    - `-d, --dry-run` — preview deletions without actually deleting
    - `-C, --clear-cache` — clear cache before scanning
- `qleaner image <images-dir> <code-root>` — find unused images
  - Options:
    - `-e, --exclude-dir-assets <dir...>` — exclude directories from the asset scan
    - `-f, --exclude-file-assets <file...>` — exclude files from the asset scan
    - `-E, --exclude-dir-code <dir...>` — exclude directories from the code scan
    - `-S, --exclude-file-code <file...>` — exclude files from the code scan
    - `-r, --is-root-folder-referenced` — treat paths as root-referenced (e.g., `/img/a.png`)
    - `-a, --alias` — treat alias patterns (e.g., `@/assets/...`) as used
    - `-t, --table` — print results in a table
    - `-C, --clear-cache` — clear cache before scanning
    - `-H, --hide-not-found-images` — hide images referenced in code but not found on disk
    - `-d, --dry-run` — preview deletions without actually deleting

Refer to the CLI help for full flag lists: `qleaner --help` or `qleaner <command> --help`.

## How it works (brief)

- Discovers code and image files using fast-glob
- Parses code with Babel AST to extract imports and image references
- Resolves modules with `enhanced-resolve` (supports aliases)
- Compares discovered files against resolved references to identify unused items
- Uses a cache to speed up subsequent runs; caches are invalidated on file changes

## Requirements

- Node.js 14+ (LTS recommended)
- npm or yarn

## Contributing

Contributions welcome. Open issues or submit pull requests against the repository.

## License

MIT

## Version

1.2.0

Current version: 1.2.0
