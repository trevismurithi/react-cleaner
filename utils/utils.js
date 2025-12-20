const prompts = require('prompts');
const fs = require('fs');
const path = require('path');
const cliProgress = require('cli-progress');

async function askDeleteFiles(files) {
    const response = await prompts({
        type: 'multiselect',
        name: 'toDelete',
        message: 'Select unused files to delete or move to .trash directory',
        choices: files.map(file => ({
            title: file,
            value: file,
        })) 
    })
    if(response && response.toDelete && response.toDelete.length > 0) {
        const method = await prompts({
            type: 'select',
            name: 'method',
            message: 'Select a method to delete the files',
            choices: [
                { title: 'Move to .trash directory', value: 'moveToTrash' },
                { title: 'Delete files', value: 'deleteFiles' },
            ]
        })
        if(method.method === 'moveToTrash') {
            return await moveToTrash(response.toDelete);
        } else if(method.method === 'deleteFiles') {
            return await deleteFiles(response.toDelete);
        }
    }
}

async function moveToTrash(files) {
    const trashDir = path.join(process.cwd(), '.trash');

    if(!fs.existsSync(trashDir)) {
        fs.mkdirSync(trashDir);
    }

    for(const file of files) {
        if(!fs.existsSync(file)) {
            console.error(`File ${file} does not exist, skipping...`);
            continue;
        }
       const fileName = path.basename(file);
       const destination = path.join(trashDir, fileName);
       fs.renameSync(file, destination);
    }

    console.log(`Moved ${files.length} files to .trash directory`);
}

async function deleteFiles(files) {
    for(const file of files) {
        try {
            fs.unlinkSync(file);
        } catch (error) {
            console.error(`Error deleting file ${file}: ${error}`);
        }
    }
    console.log(`Deleted ${files.length} files`);
}

function isExcludedFile(file, excludeFiles) {
    return excludeFiles.some((exclude) => file.includes(exclude));
  }
  
  function compareFiles(filePath, importPath) {
    return filePath === importPath;
  }

  function createStepBar(step, total, label, chalk) {
    const bar = new cliProgress.SingleBar({
      format: `${chalk.cyan(`[${step}]`)} ${label} |{bar}| {value}/{total}`,
      barCompleteChar: "█",
      barIncompleteChar: "░",
      hideCursor: true
    });
  
    bar.start(total, 0);
    return bar;
  }

module.exports = {
    askDeleteFiles,
    isExcludedFile,
    compareFiles,
    createStepBar,
};