const fs = require('fs');
const path = require('path');

async function init(chalk) {
    const configFile = path.join(process.cwd(), 'qleaner.config.json');
    if(fs.existsSync(configFile)) {
        console.log(chalk.red('Qleaner config file already exists'));
        return;
    }
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
        excludeFileAsset: [], // Exclude files from the asset scan
        excludeFilePrintAsset: [], // Scan but don't print the excluded asset files
        excludeDirCode: [], // Exclude directories from the code scan
        excludeFileCode: [], // Exclude files from the code scan
        excludeFilePrintCode: [], // Scan but don't print the excluded code files
        isRootFolderReferenced: false, // Is the root folder referenced in the image path eg /img/a.png where img is the image root folder
        alias: false, // Is the alias referenced in the image path eg @/assets/images/a.png
    }, null, 2));
    console.log(chalk.green('Qleaner config file created successfully'));
}

module.exports = {
    init
}