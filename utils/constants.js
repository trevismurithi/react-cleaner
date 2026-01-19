// Regex for matching url("x.png") or url('x.png') or bg-[url('x.png')]
const URL_EXTRACT_REGEX = /url\((['"]?)([^"')]+)\1\)/gi;

// Normal image file regex
const IMAGE_REGEX = /\.(png|jpe?g|svg|gif|webp)$/i;

const REACT_ENTRY_FILES = [
  "index.js",
  "index.jsx",
  "index.ts",
  "index.tsx",
  "main.js",
  "main.jsx",
  "main.ts",
  "main.tsx",
];

const NEXT_ENTRY_FILES = [
  "page.tsx",
  "page.jsx",
  "route.ts",
  "route.jsx",
  "layout.tsx",
  "layout.jsx",
  "middleware.ts",
  "middleware.js",
  "error.tsx",
  "error.jsx",
  "loading.tsx",
  "loading.jsx",
  "not-found.tsx",
  "not-found.jsx",
  "global-error.tsx",
  "global-error.jsx",
  "_app.tsx",
  "_app.jsx",
  "_document.tsx",
  "_document.jsx",
  "_error.tsx",
  "_error.jsx",
  "robots.ts",
  "robots.js",
  "sitemap.ts",
  "sitemap.js",
  "manifest.ts",
  "manifest.js",
];

const EXTENSIONS_TO_EXCLUDE = [
  "test.tsx",
  "test.ts",
  "test.js",
  "test.jsx",
  "spec.tsx",
  "spec.ts",
  "spec.js",
  "spec.jsx",
  "d.ts",
  "config.js",
  "config.cjs",
  "config.mjs",
  "config.ts",
  "setupTests.ts",
  "setupTests.js",
  "setup.ts",
  "setup.js",
];

const DIRECTORIES_TO_EXCLUDE = [
  "node_modules",
  "dist",
  "build",
  "dist",
  ".next",
  "out",
  "coverage",
  ".turbo",
  ".vite",
  ".cache",
  ".vercel",
  ".netlify",
  "storybook-static",
  "generated",
  "prisma",
  "graphql",
  "supabase",
  "drizzle",
  "__generated__",
];

const QUESTIONS = [
  {
    type: "select",
    name: "packageManager",
    message: "Select your package manager",
    choices: [
      { title: "npm", value: "npm" },
      { title: "yarn", value: "yarn" },
      { title: "pnpm", value: "pnpm" },
    ],
    initial: 0,
  },
  {
    type: "select",
    name: "alias",
    message: "How do you reference images in your project?",
    initial: 0,
    choices: [
      { title: "Relative paths (./assets/logo.png)", value: "relative" },
      { title: "Absolute paths from public/ (/images/logo.png)", value: "public" },
    ],
  },
  {
    type: "select",
    name: "framework",
    message: "Select your project framework",
    choices: [
      { title: "React", value: "react" },
      { title: "Next.js", value: "nextjs" },
    ],
    initial: 0,
  },
  {
    type: "select",
    name: "codeAlias",
    message: "Which project configuration file should Qleaner use to resolve import aliases?",
    choices: [
      { title: "tsconfig.json", value: "tsconfig.json" },
      { title: "jsconfig.json", value: "jsconfig.json" },
      { title: "tsconfig.app.json", value: "tsconfig.app.json" },
      { title: "tsconfig.base.json", value: "tsconfig.base.json" },
      { title: "none", value: null },
    ],
    initial: 0,
  },
];

module.exports = {
  URL_EXTRACT_REGEX,
  IMAGE_REGEX,
  REACT_ENTRY_FILES,
  NEXT_ENTRY_FILES,
  EXTENSIONS_TO_EXCLUDE,
  DIRECTORIES_TO_EXCLUDE,
  QUESTIONS,
};
