const Table = require("cli-table3");
const { formatFilePath } = require("../controllers/summary");

/**
 * Display unused images in table or list format
 * @param {Set} unusedImages - Set of unused image objects
 * @param {Object} options - Options object
 * @param {Object} chalk - Chalk instance for colored output
 */
function displayUnusedImages(unusedImages, options, chalk) {
  let totalSize = 0;
  
  if (unusedImages.size === 0) {
    console.log(chalk.green.bold("\n✓ No unused images found!"));
    console.log(chalk.green("════════════════════════════════════════════════\n"));
    return;
  }

  if (options.dryRun) {
    console.log(chalk.cyan.bold('\n[DRY RUN MODE] No images will be deleted\n'));
  }

  if (options.table) {
    const table = new Table({
      head: options.dryRun
        ? [
            chalk.cyan("Unused Images (Would Delete)"),
            chalk.cyan("In Code"),
            chalk.cyan("Exists"),
            chalk.cyan("Size"),
          ]
        : [
            chalk.cyan("Unused Images"),
            chalk.cyan("In Code"),
            chalk.cyan("Exists"),
            chalk.cyan("Size"),
          ],
      colWidths: [75, 10, 10, 15],
      style: { head: [], border: [] }
    });
    
    unusedImages.forEach((img) => {
      const inCode = img.hash === null;
      const exists = img.hash !== null;
      const size = img.size > 0 ? (img.size / (1024 * 1024)).toFixed(2) + " MB" : "N/A";
      
      table.push([
        chalk.white(formatFilePath(img.file, 70)),
        inCode ? chalk.red("Yes") : chalk.green("No"),
        exists ? chalk.green("Yes") : chalk.red("No"),
        chalk.yellow(size),
      ]);
      totalSize += img.size;
    });
    console.log(table.toString());
  } else {
    unusedImages.forEach((img) => {
      const inCode = img.hash === null;
      const exists = img.hash !== null;
      const size = img.size > 0 ? (img.size / (1024 * 1024)).toFixed(2) + " MB" : "N/A";
      
      console.log(
        chalk.white("🖼️  ") +
        chalk.blue(formatFilePath(img.file, 85)) +
        " - " +
        chalk.cyan("in code: ") +
        (inCode ? chalk.red("Yes") : chalk.green("No")) +
        " - " +
        chalk.cyan("exists: ") +
        (exists ? chalk.green("Yes") : chalk.red("No")) +
        " - " +
        chalk.cyan("size: ") +
        chalk.yellow(size)
      );
      totalSize += img.size;
    });
  }
  
  // Summary section
  console.log(chalk.green("\n════════════════════════════════════════════════"));
  console.log(
    chalk.yellow.bold("Total Size: ") + 
    chalk.yellow((totalSize / (1024 * 1024)).toFixed(2) + " MB")
  );
  console.log(
    chalk.magenta.bold("Total Images: ") + 
    chalk.magenta(unusedImages.size)
  );
  console.log(chalk.green("════════════════════════════════════════════════\n"));
}

/**
 * Handle deletion logic for unused images
 * @param {Set} unusedImages - Set of unused image objects
 * @param {Object} options - Options object
 * @param {Object} chalk - Chalk instance for colored output
 */
function handleImageDeletion(unusedImages, options, chalk) {
  const { askDeleteFiles } = require("./utils");
  
  if (options.dryRun) {
    console.log(
      chalk.cyan(`\n[DRY RUN] Would delete ${unusedImages.size} file(s)`)
    );
  } else if (unusedImages.size > 0) {
    askDeleteFiles(unusedImages, false);
  }
}

module.exports = {
  displayUnusedImages,
  handleImageDeletion,
};
