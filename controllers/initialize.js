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

async function init(chalk) {
  const responses = await prompts(QUESTIONS);
  const ISROOT = responses.alias === "relative" ? true : false;
  const ALIAS = responses.alias === "public" ? true : false;
  const configFile = path.join(process.cwd(), "qleaner.config.json");
  fs.writeFileSync(
    configFile,
    JSON.stringify(
      {
        codeAlias: responses.codeAlias,
        paths: {},
        packageManager: responses.packageManager || "npm",
        excludeDir: DIRECTORIES_TO_EXCLUDE, // Exclude directories from the scan
        excludeFile: ["payload-types.ts", "payload-types.js"], // Exclude files from the scan
        excludeExtensions: EXTENSIONS_TO_EXCLUDE, // Exclude file extensions from the scan like .test.tsx, .test.ts, .test.js, .test.jsx
        excludeFilePrint:
          responses.framework === "nextjs"
            ? NEXT_ENTRY_FILES
            : REACT_ENTRY_FILES,
        excludeDirAssets: [], // Exclude directories from the asset scan
        excludeFileAssets: [], // Exclude files from the asset scan
        excludeDirCode: DIRECTORIES_TO_EXCLUDE, // Exclude directories from the code scan
        excludeFileCode: [], // Exclude files from the code scan
        isRootFolderReferenced: ISROOT, // Is the root folder referenced in the image path eg /img/a.png where img is the image root folder
        alias: ALIAS, // Is the alias referenced in the image path eg @/assets/images/a.png
      },
      null,
      2
    )
  );
  console.log(chalk.green("Qleaner config file created successfully"));
}

module.exports = {
  init,
};
