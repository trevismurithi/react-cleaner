# Qleaner

**Qleaner** is a powerful CLI tool for analyzing and cleaning up React, TypeScript, and JavaScript projects. It helps you identify unused files, images, dependencies, and dead code to optimize your bundle size and maintain a clean codebase.

## ✨ Features

- 🔍 **Find Unused Code Files** - Identify files that aren't imported or used anywhere
- 🖼️ **Find Unused Images** - Detect image assets that are never referenced in your code
- 📦 **Unused Dependencies** - Discover npm/yarn packages that are installed but not used
- 🔗 **Dead Image Links** - Find image references in code that point to non-existent files
- 📊 **Project Summary** - Get comprehensive statistics about your codebase
- 📈 **File Size Analysis** - Identify the largest files and potential optimization targets
- 🎯 **Dependency Analysis** - See which files have heavy dependencies and hotspots
- 💾 **Smart Caching** - Fast incremental scans with intelligent cache invalidation
- 🧪 **Dry-Run Mode** - Preview what would be deleted without actually deleting anything
- 🗑️ **Interactive Deletion** - Choose to delete files permanently or move them to `.trash`

## 🚀 Installation

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

## 📖 Quick Start

### 1. Initialize Configuration

First, set up Qleaner for your project:

```bash
qleaner init
```

This interactive command will:
- Ask about your package manager (npm/yarn/pnpm)
- Configure image path resolution (aliases or root-referenced paths)
- Detect your framework (React/Next.js) to set appropriate entry points

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

## 📋 Commands

### `qleaner init`

Initialize Qleaner with an interactive configuration wizard. Creates `qleaner.config.json` in your project root.

```bash
qleaner init
```

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
# Basic scan
qleaner scan src

# Dry run with table output
qleaner scan src --dry-run --table

# Exclude test files and node_modules
qleaner scan src -x test.tsx test.ts -e node_modules

# Clear cache and rescan
qleaner scan src --clear-cache
```

### `qleaner image <images-dir> <code-root>`

Scan for unused images by comparing image files against references in your code.

**Arguments:**
- `<images-dir>` - Directory containing image files
- `<code-root>` - Root directory of your source code

**Options:**
- `-e, --exclude-dir-assets <dir...>` - Exclude directories from image scan
- `-f, --exclude-file-assets <file...>` - Exclude image files by name
- `-E, --exclude-dir-code <dir...>` - Exclude directories from code scan
- `-S, --exclude-file-code <file...>` - Exclude files from code scan
- `-r, --is-root-folder-referenced` - Images use root-referenced paths (e.g., `/images/logo.png`)
- `-a, --alias` - Images use alias paths (e.g., `@/assets/images/logo.png`)
- `-t, --table` - Display results in a formatted table
- `-C, --clear-cache` - Clear cache before scanning
- `-H, --hide-not-found-images` - Hide images referenced in code but not found on disk
- `-d, --dry-run` - Preview deletions without actually deleting

**Examples:**
```bash
# Basic image scan
qleaner image public/images src

# With alias paths
qleaner image public/images src -a

# With root-referenced paths
qleaner image public/images src -r

# Hide dead links and use table format
qleaner image public/images src -H -t
```

**Supported Image Reference Patterns:**
- `import logo from './logo.png'`
- `require('./logo.png')`
- `<img src="./logo.png" />`
- `style={{ backgroundImage: "url('./logo.png')" }}`
- CSS files: `url('./logo.png')`
- Styled-components: `` css`background-image: url('./logo.png')` ``
- Arrays: `['./logo.png', './icon.png']`
- Template literals: `` `./logo-${name}.png` ``

### `qleaner list <dependency>`

List all files that use a specific dependency (module, package, or file path).

**Options:**
- `-t, --table` - Display results in a formatted table

**Examples:**
```bash
# List files using react-router
qleaner list react-router

# List files using a local module
qleaner list ./utils/helpers

# With table format
qleaner list lodash --table
```

**Note:** Requires a cache file. Run `qleaner scan` first.

### `qleaner dep`

Find unused npm/yarn dependencies in your project.

**Options:**
- `-d, --directory <directory>` - Directory containing package.json (defaults to current directory)
- `-t, --table` - Display results in a formatted table

**Examples:**
```bash
# Find unused dependencies
qleaner dep

# In a specific directory
qleaner dep -d ./packages/my-package

# With table format
qleaner dep --table
```

**Note:** Requires a cache file. Run `qleaner scan` first.

### `qleaner summary`

Get comprehensive project statistics and insights.

**Options:**
- `-l, --largest-files` - Show top 10 largest code and image files
- `-d, --dependencies` - Show dependency analysis and hotspots

**Examples:**
```bash
# Full project summary
qleaner summary

# Show largest files
qleaner summary --largest-files

# Show dependency analysis
qleaner summary --dependencies
```

**Summary includes:**
- Total code files and image files
- Unused files and images count
- Dead image links count
- File sizes and totals
- Code files above 100 KB
- Files with heavy/light dependencies
- File hotspots (most imported files)
- Dependency hotspots

**Note:** Requires a cache file. Run `qleaner scan` and/or `qleaner image` first.

## ⚙️ Configuration

Qleaner can be configured via `qleaner.config.json` or CLI flags. CLI flags always override config file values.

### Configuration File Structure

```json
{
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

**Important:** `isRootFolderReferenced` and `alias` should not both be `true` or both be `false`. Set one to `true` and the other to `false`.

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

## 💾 Caching

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

## 🗑️ File Deletion

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

## 🔧 How It Works

### Code Analysis
1. **File Discovery** - Uses `fast-glob` to find all code files matching patterns
2. **AST Parsing** - Parses JavaScript/TypeScript with Babel to extract imports
3. **Module Resolution** - Uses `enhanced-resolve` to resolve import paths (supports aliases)
4. **Dependency Graph** - Builds a graph of file dependencies
5. **Unused Detection** - Identifies files with no incoming imports (except entry points)

### Image Analysis
1. **Image Discovery** - Finds all image files (png, jpg, jpeg, svg, gif, webp)
2. **Code Scanning** - Extracts image references from:
   - Import statements
   - Require calls
   - JSX attributes (`<img src>`)
   - CSS files (`url()`)
   - Styled-components
   - Template literals
   - Arrays
   - String literals
3. **Path Normalization** - Normalizes paths based on alias/root configuration
4. **Unused Detection** - Compares image files against references

## 📊 Example Workflow

```bash
# 1. Initialize configuration
qleaner init

# 2. Scan for unused code files (dry run)
qleaner scan src --dry-run --table

# 3. Scan for unused images (dry run)
qleaner image public/images src -r --dry-run --table

# 4. Check for unused dependencies
qleaner dep --table

# 5. Get project summary
qleaner summary

# 6. Get largest files report
qleaner summary --largest-files

# 7. Get dependency analysis
qleaner summary --dependencies

# 8. Once confident, run actual scans and delete files
qleaner scan src
qleaner image public/images src -r
```

## 🎯 Use Cases

- **Before Deployment** - Clean up unused files to reduce bundle size
- **Code Review** - Verify no unused files are being added
- **Refactoring** - Find files that can be safely removed
- **Optimization** - Identify large files and dependency hotspots
- **Maintenance** - Regular cleanup to keep codebase healthy

## 📝 Requirements

- Node.js 14+ (LTS recommended)
- npm or yarn

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT

## 🔗 Links

- **Repository:** [https://github.com/trevismurithi/react-cleaner](https://github.com/trevismurithi/react-cleaner)
- **Issues:** [https://github.com/trevismurithi/react-cleaner/issues](https://github.com/trevismurithi/react-cleaner/issues)
- **NPM Package:** [https://www.npmjs.com/package/qleaner](https://www.npmjs.com/package/qleaner)

## 📚 Additional Resources

### Tips for Best Results

1. **Run scans regularly** - Set up a cron job or CI check
2. **Use dry-run first** - Always preview before deleting
3. **Review entry points** - Make sure `excludeFilePrint` includes all entry files
4. **Clear cache when needed** - After major changes, clear and rescan
5. **Test after deletion** - Always test your application after removing files

### Common Issues

**Q: Qleaner reports files as unused that are actually used.**
A: Check your `excludeFilePrint` config - these files are likely entry points that should be excluded from unused reporting.

**Q: Images aren't being detected.**
A: Verify your `alias` and `isRootFolderReferenced` settings match how images are referenced in your code.

**Q: Scan is slow on large projects.**
A: This is normal for first scans. Subsequent scans use caching and are much faster. You can also exclude more directories to speed things up.

**Q: How do I undo deletions?**
A: If you used "Move to `.trash`", files are in the `.trash` directory. If you permanently deleted, use git to restore if you're using version control.

---

**Made with ❤️ for clean codebases**
