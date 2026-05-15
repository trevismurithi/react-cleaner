const fs = require("fs");
const path = require("path");
const prompts = require("prompts");
const {
  QUESTIONS,
  DIRECTORIES_TO_EXCLUDE,
  EXTENSIONS_TO_EXCLUDE,
  NEXT_ENTRY_FILES,
  REACT_ENTRY_FILES,
} = require("../utils/constants");

const GITIGNORE_SECTION_HEADER = "# Qleaner";
const CACHE_FILE_GITIGNORE_ENTRY = "unused-check-cache.json";
const TRASH_DIR_GITIGNORE_ENTRY = ".trash/";

/**
 * Appends Qleaner-related ignore rules to `.gitignore` when they are missing.
 * @param {string} projectRoot - Absolute path to the project (typically `process.cwd()`).
 */
function appendQleanerGitignoreEntries(projectRoot) {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  const rawGitignore = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf8")
    : "";
  const gitignoreLines = rawGitignore.split(/\r?\n/);
  const trimmedLines = gitignoreLines.map((line) => line.trim());

  const cacheFileAlreadyIgnored = trimmedLines.some((trimmedLine) => {
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return false;
    }
    return (
      trimmedLine === CACHE_FILE_GITIGNORE_ENTRY ||
      trimmedLine.endsWith(`/${CACHE_FILE_GITIGNORE_ENTRY}`)
    );
  });

  const trashDirAlreadyIgnored = trimmedLines.some((trimmedLine) => {
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return false;
    }
    return (
      trimmedLine === ".trash" ||
      trimmedLine === TRASH_DIR_GITIGNORE_ENTRY ||
      trimmedLine.startsWith(".trash/")
    );
  });

  const ignoreLinesToAppend = [];
  if (!cacheFileAlreadyIgnored) {
    ignoreLinesToAppend.push(CACHE_FILE_GITIGNORE_ENTRY);
  }
  if (!trashDirAlreadyIgnored) {
    ignoreLinesToAppend.push(TRASH_DIR_GITIGNORE_ENTRY);
  }
  if (ignoreLinesToAppend.length === 0) {
    return;
  }

  let updatedGitignore = rawGitignore;
  if (updatedGitignore.length > 0 && !updatedGitignore.endsWith("\n")) {
    updatedGitignore += "\n";
  }
  if (updatedGitignore.length > 0 && !updatedGitignore.endsWith("\n\n")) {
    updatedGitignore += "\n";
  }
  updatedGitignore += `${GITIGNORE_SECTION_HEADER}\n${ignoreLinesToAppend.join("\n")}\n`;
  fs.writeFileSync(gitignorePath, updatedGitignore, "utf8");
}

async function init() {
  const initAnswers = await prompts(QUESTIONS);
  const isRootFolderReferenced = initAnswers.alias === "relative";
  const useImagePathAlias = initAnswers.alias === "public";
  const projectRoot = process.cwd();
  const configFilePath = path.join(projectRoot, "qleaner.config.json");
  fs.writeFileSync(
    configFilePath,
    JSON.stringify(
      {
        framework: initAnswers.framework,
        codeAlias: initAnswers.codeAlias,
        paths: {},
        packageManager: initAnswers.packageManager || "npm",
        excludeDir: DIRECTORIES_TO_EXCLUDE, // Exclude directories from the scan
        excludeFile: ["payload-types.ts", "payload-types.js"], // Exclude files from the scan
        excludeExtensions: EXTENSIONS_TO_EXCLUDE, // Exclude file extensions from the scan like .test.tsx, .test.ts, .test.js, .test.jsx
        excludeDirPrint: initAnswers.framework === "vue" ? ["layouts", "pages"] : [], // Exclude directories from the print scan
        excludeFilePrint:
          initAnswers.framework === "nextjs"
            ? NEXT_ENTRY_FILES
            : initAnswers.framework === "vue" ? [] : REACT_ENTRY_FILES,
        excludeDirAssets: [], // Exclude directories from the asset scan
        excludeFileAssets: [], // Exclude files from the asset scan
        excludeDirCode: DIRECTORIES_TO_EXCLUDE, // Exclude directories from the code scan
        excludeFileCode: [], // Exclude files from the code scan
        isRootFolderReferenced, // Is the root folder referenced in the image path eg /img/a.png where img is the image root folder
        alias: useImagePathAlias, // Is the alias referenced in the image path eg @/assets/images/a.png
      },
      null,
      2
    )
  );
  appendQleanerGitignoreEntries(projectRoot);
}

module.exports = {
  init,
};
