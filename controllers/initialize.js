const fs = require('fs');
const path = require('path');

async function init(chalk) {
    const configFile = path.join(process.cwd(), 'qleaner.config.json');
    fs.writeFileSync(configFile, JSON.stringify({
        excludeDir: [
            "node_modules",
            "dist",
            "build",
        ], // Exclude directories from the scan
        excludeFile: [], // Exclude files from the scan
        excludeFilePrint: [
            "page.tsx"
        ], // Scan but don't print the excluded files
        excludeDirAssets: [], // Exclude directories from the asset scan
        excludeFileAssets: [], // Exclude files from the asset scan
        excludeDirCode: [
            "node_modules",
            "dist",
            "build",
        ], // Exclude directories from the code scan
        excludeFileCode: [
            "index.tsx",
        ], // Exclude files from the code scan
        isRootFolderReferenced: false, // Is the root folder referenced in the image path eg /img/a.png where img is the image root folder
        alias: true, // Is the alias referenced in the image path eg @/assets/images/a.png
        table: true, // Print the results in a table
    }, null, 2));
    console.log(chalk.green('Qleaner config file created successfully'));
}

module.exports = {
    init
}