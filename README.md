# Qleaner

Qleaner is a safe, fast CLI that finds unused code files and image assets in JavaScript and TypeScript projects (React-ready). It helps you audit and clean large repositories by reporting unused/orphaned files, image dead-links, dependency hotspots, and large-file warnings — with a dry-run mode so you never delete by accident.

**Key points:**

- **Safe first**: Preview deletions using `--dry-run` before removing anything.
- **Configurable**: Use `qleaner.config.json` or CLI flags to fine-tune scans.
- **Fast**: Uses caching and incremental analysis for large repos.

## Project metadata

- **Package name:** qleaner
- **Version:** 1.1.5
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
- `qleaner scan <path>` — find unused code files
- `qleaner image <images-dir> <code-root>` — find unused images
- `qleaner summary` — project statistics, largest files, dependency hotspots

Common flags:

- `--dry-run` — preview deletions without changing files
- `--table` — show results in table format
- `--clear-cache` — ignore cache and perform a fresh scan
- `-e/--exclude-dir` `-f/--exclude-file` `-x/--exclude-extensions` — exclusion flags

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

1.1.5

Current version: 1.1.3
