const Table = require("cli-table3");
const { formatFilePath } = require("../controllers/summary");

const RULE = "════════════════════════════════════════════════";

/**
 * @param {Object} options
 * @returns {number | null} Positive MB threshold, or null if disabled / invalid
 */
function resolveSizeThresholdMb(options) {
  const raw = options.sizeThresholdMb;
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

/**
 * @param {number} sizeBytes
 * @param {number | null} thresholdMb
 */
function isOverSizeThreshold(sizeBytes, thresholdMb) {
  if (thresholdMb == null) {
    return false;
  }
  return sizeBytes > thresholdMb * 1024 * 1024;
}

function formatSizeMb(sizeBytes) {
  if (sizeBytes > 0) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return "N/A";
}

/**
 * Display unused images in table or list format
 * @param {Set} unusedImages - Set of unused image objects
 * @param {Object} options - Options object
 * @param {Object} chalk - Chalk instance for colored output
 */
function displayUnusedImages(unusedImages, options, chalk) {
  if (unusedImages.size === 0) {
    console.log(chalk.green("\n✓ No unused images found."));
    return;
  }

  const thresholdMb = resolveSizeThresholdMb(options);
  const showThresholdColumn = thresholdMb != null;

  if (options.dryRun) {
    console.log(
      chalk.cyan.bold("\n[DRY RUN] No images will be moved or deleted\n"),
    );
  }

  let totalSizeBytes = 0;

  if (options.table) {
    const baseHead = options.dryRun
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
        ];

    if (showThresholdColumn) {
      baseHead.push(chalk.cyan(`>${thresholdMb} MB`));
    }

    const table = new Table({
      head: baseHead,
      colWidths: showThresholdColumn ? [65, 10, 10, 12, 10] : [75, 10, 10, 15],
      style: { head: [], border: [] },
    });

    unusedImages.forEach((img) => {
      const referencedInCode = img.hash === null;
      const existsOnDisk = img.hash !== null;
      const sizeLabel = formatSizeMb(img.size);
      const over = isOverSizeThreshold(img.size, thresholdMb);

      const row = [
        chalk.white(formatFilePath(img.file, showThresholdColumn ? 60 : 70)),
        referencedInCode ? chalk.red("Yes") : chalk.green("No"),
        existsOnDisk ? chalk.green("Yes") : chalk.red("No"),
        chalk.yellow(sizeLabel),
      ];
      if (showThresholdColumn) {
        row.push(over ? chalk.red("Yes") : chalk.dim("No"));
      }
      table.push(row);
      totalSizeBytes += img.size;
    });
    console.log(table.toString());
  } else {
    unusedImages.forEach((img) => {
      const sizeLabel = formatSizeMb(img.size);
      const over = isOverSizeThreshold(img.size, thresholdMb);
      const pathPart = chalk.blue(formatFilePath(img.file, 85));
      const sizePart = chalk.yellow(sizeLabel);
      const flagPart =
        showThresholdColumn && over
          ? ` ${chalk.red(`(over ${thresholdMb} MB)`)}`
          : "";
      console.log(`${chalk.white("🖼 ")}${pathPart} — ${sizePart}${flagPart}`);
      totalSizeBytes += img.size;
    });
  }

  console.log(chalk.green(`\n${RULE}`));
  console.log(
    chalk.yellow.bold("Total unused images: ") +
      chalk.yellow(String(unusedImages.size)),
  );
  console.log(
    chalk.yellow.bold("Combined size: ") +
      chalk.yellow(`${(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB`),
  );
  if (showThresholdColumn) {
    const overCount = [...unusedImages].filter((img) =>
      isOverSizeThreshold(img.size, thresholdMb),
    ).length;
    console.log(
      chalk.magenta.bold(`Larger than ${thresholdMb} MB: `) +
        chalk.magenta(String(overCount)),
    );
  }
  console.log(chalk.green(`${RULE}\n`));

  if (options.dryRun && options.autoPrune) {
    console.log(
      chalk.cyan(
        `[DRY RUN] Would move ${unusedImages.size} image(s) to .trash with --auto-prune\n`,
      ),
    );
  }
}

/**
 * Handle deletion logic for unused images
 * @param {Set} unusedImages - Set of unused image objects
 * @param {Object} options - Options object
 * @param {Object} chalk - Chalk instance for colored output
 */
async function handleImageDeletion(unusedImages, options, chalk) {
  const { askDeleteFiles, moveToTrash } = require("./utils");

  if (options.dryRun) {
    return;
  }

  if (unusedImages.size === 0) {
    return;
  }

  if (options.autoPrune) {
    const listOfFiles = Array.from(unusedImages, (entry) => ({
      file: entry.file,
      size: entry.size,
    }));
    await moveToTrash(listOfFiles, unusedImages, false);
    console.log(
      chalk.green(
        `Moved ${listOfFiles.length} unused image(s) to the .trash directory.`,
      ),
    );
    return;
  }

  await askDeleteFiles(unusedImages, false);
}

module.exports = {
  displayUnusedImages,
  handleImageDeletion,
};
