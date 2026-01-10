const fs = require("fs");
const path = require("path");
const Table = require("cli-table3");
const { hydrateGraph } = require("../command");
const {
  getDeadLinks,
  getTotalImageSize,
  getTotalCodeSize,
  getTop10LargestImages,
  getTop10LargestCodeFiles,
  findCodeFilesAbove100KB,
  getTop10FilesWithHeavyDependencies,
  getTop10FilesWithLightDependencies,
  getTop10FilesHotspots,
  getTotalImageFiles,
  getTop10FilesCodeDependencies,
  getTop10FilesDependenciesHotspots,
} = require("../utils/summary");

function formatFilePath(filePath, maxLength = 70) {
  // Convert absolute path to relative path if possible
  let relativePath = filePath;
  try {
    const cwd = process.cwd();
    if (path.isAbsolute(filePath) && filePath.startsWith(cwd)) {
      relativePath = path.relative(cwd, filePath);
      // Handle root-relative paths (e.g., "../" outside project)
      if (relativePath.startsWith("..")) {
        relativePath = filePath; // Use absolute if outside project
      }
    }
  } catch (e) {
    // If conversion fails, use original path
  }

  // If path fits, return as-is
  if (relativePath.length <= maxLength) {
    return relativePath;
  }

  // Extract filename and directory
  const filename = path.basename(relativePath);
  const dirname = path.dirname(relativePath);

  // If filename itself is too long, truncate it
  if (filename.length > maxLength - 4) {
    return "..." + filename.slice(-(maxLength - 4));
  }

  // Calculate available space for directory path
  const ellipsisLength = 3; // "..."
  const separatorLength = 1; // "/"
  const availableForDir =
    maxLength - filename.length - ellipsisLength - separatorLength;

  if (availableForDir <= 0) {
    // Not enough space, just show filename
    return filename;
  }

  if (dirname === "." || dirname.length <= availableForDir) {
    // Directory fits or is current directory
    return relativePath;
  }

  // Truncate directory: show beginning + ... + filename
  const truncatedDir = dirname.slice(0, availableForDir);
  return truncatedDir + "/..." + filename;
}

function readCacheAndHydrateGraph() {
  // read unused-check-cache.json
  const cache = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "unused-check-cache.json"), "utf8")
  );
  // hydrate the graph
  const codeGraph = {
    graph: hydrateGraph(cache.parentGraph.graph),
    unusedFiles: new Set(cache.parentGraph.unusedFiles),
  };
  const imageGraph = {
    graph: hydrateGraph(cache.imageParentGraph.imageGraph),
    unusedImages: new Set(cache.imageParentGraph.unusedImages),
  };
  return { codeGraph, imageGraph };
}

function summarizeAll(chalk) {
  const { codeGraph, imageGraph } = readCacheAndHydrateGraph();
  // Get dead links from the graph
  const deadImageLinks = getDeadLinks(imageGraph.graph).deadLinks;

  // Check if data is available
  const hasData = codeGraph.graph.size > 0 || imageGraph.graph.size > 0;

  if (!hasData) {
    console.log(chalk.yellow.bold("\n⚠️  No Project Data Found"));
    console.log(
      chalk.yellow("════════════════════════════════════════════════")
    );
    console.log(chalk.yellow("   Run a scan to analyze your project first."));
    console.log(
      chalk.yellow("   Use the scan command to generate project data.\n")
    );
    return;
  }
  const totalImageFiles = getTotalImageFiles(imageGraph.graph);
  // summarize the graph
  const summary = {
    totalCodeFiles: codeGraph.graph.size,
    totalImageFiles: totalImageFiles,
    totalUnusedFiles: codeGraph.unusedFiles.size,
    totalUnusedImages: imageGraph.unusedImages.size - deadImageLinks.size,
    totalDeadImageLinks: deadImageLinks.size,
    totalFiles: codeGraph.graph.size + totalImageFiles,
  };

  console.log(chalk.green.bold("\n📋 Project Summary"));
  console.log(chalk.green("════════════════════════════════════════════════"));

  const summaryTable = new Table({
    colWidths: [35, 20],
    style: { head: [], border: [] },
  });

  // Format values with appropriate colors
  const formatValue = (value, isGood = false) => {
    if (value === 0 && !isGood) {
      return chalk.green("✓ 0");
    }
    if (isGood) {
      return chalk.green(value.toString());
    }
    return chalk.yellow(value.toString());
  };

  summaryTable.push(
    [
      chalk.cyan("📄 Total Code Files:"),
      formatValue(summary.totalCodeFiles, true),
    ],
    [
      chalk.cyan("🖼️  Total Image Files:"),
      formatValue(summary.totalImageFiles, true),
    ],
    [
      chalk.cyan("🗑️  Total Unused Files:"),
      summary.totalUnusedFiles > 0
        ? chalk.red(summary.totalUnusedFiles.toString())
        : chalk.green("✓ 0"),
    ],
    [
      chalk.cyan("🗑️  Total Unused Images:"),
      summary.totalUnusedImages > 0
        ? chalk.red(summary.totalUnusedImages.toString())
        : chalk.green("✓ 0"),
    ],
    [
      chalk.cyan("🔗 Total Dead Image Links:"),
      summary.totalDeadImageLinks > 0
        ? chalk.red(summary.totalDeadImageLinks.toString())
        : chalk.green("✓ 0"),
    ],
    [
      chalk.cyan.bold("📦 Total Files:"),
      chalk.magenta.bold(summary.totalFiles.toString()),
    ]
  );

  console.log(summaryTable.toString());
  console.log(
    chalk.green("════════════════════════════════════════════════\n")
  );
}

function getTop10LargestFiles(chalk) {
  const { codeGraph, imageGraph } = readCacheAndHydrateGraph();
  const totalCodeSize = getTotalCodeSize(codeGraph.graph);
  const totalImageSize = getTotalImageSize(imageGraph.graph);
  const top10CodeFiles = getTop10LargestCodeFiles(codeGraph.graph);
  const top10ImageFiles = getTop10LargestImages(imageGraph.graph, false);
  const codeFilesAbove100KB = findCodeFilesAbove100KB(codeGraph.graph);

  // Top 10 Largest Code Files
  console.log(chalk.green.bold("\n📊 Top 10 Largest Code Files"));
  console.log(chalk.green("════════════════════════════════════════════════"));
  if (!top10CodeFiles || top10CodeFiles.length === 0) {
    console.log(
      chalk.yellow(
        "   No code files found. Run a scan to analyze your project."
      )
    );
  } else {
    const codeTable = new Table({
      head: [chalk.cyan("File Path"), chalk.cyan("Size")],
      colWidths: [90, 15],
      style: { head: [], border: [] },
    });
    top10CodeFiles.forEach((file, index) => {
      codeTable.push([
        chalk.white(formatFilePath(file[0], 85)),
        chalk.magenta((file[1] / 1024).toFixed(2) + " KB"),
      ]);
    });
    console.log(codeTable.toString());
  }
  console.log(chalk.green("════════════════════════════════════════════════"));

  // Top 10 Largest Image Files
  console.log(chalk.green.bold("\n🖼️  Top 10 Largest Image Files"));
  console.log(chalk.green("════════════════════════════════════════════════"));
  if (!top10ImageFiles || top10ImageFiles.length === 0) {
    console.log(
      chalk.yellow(
        "   No image files found. Run a scan to analyze your project."
      )
    );
  } else {
    const imageTable = new Table({
      head: [chalk.cyan("File Path"), chalk.cyan("Size")],
      colWidths: [90, 15],
      style: { head: [], border: [] },
    });
    top10ImageFiles.forEach((file) => {
      imageTable.push([
        chalk.white(formatFilePath(file[0], 85)),
        chalk.magenta((file[1] / (1024 * 1024)).toFixed(2) + " MB"),
      ]);
    });
    console.log(imageTable.toString());
  }
  console.log(chalk.green("════════════════════════════════════════════════"));

  // Total Sizes Summary
  console.log(chalk.green.bold("\n📈 Total Sizes Summary"));
  console.log(chalk.green("════════════════════════════════════════════════"));
  const sizeTable = new Table({
    colWidths: [30, 20],
    style: { head: [], border: [] },
  });
  sizeTable.push(
    [
      chalk.cyan("Total Code Size:"),
      totalCodeSize > 0
        ? chalk.yellow((totalCodeSize / 1024).toFixed(2) + " KB")
        : chalk.gray("No data"),
    ],
    [
      chalk.cyan("Total Image Size:"),
      totalImageSize > 0
        ? chalk.yellow((totalImageSize / (1024 * 1024)).toFixed(2) + " MB")
        : chalk.gray("No data"),
    ]
  );
  console.log(sizeTable.toString());
  console.log(chalk.green("════════════════════════════════════════════════"));

  // Code Files Above 100 KB
  console.log(chalk.green.bold("\n⚠️  Code Files Above 100 KB"));
  console.log(chalk.green("════════════════════════════════════════════════"));
  if (!codeFilesAbove100KB || codeFilesAbove100KB.length === 0) {
    console.log(chalk.green("   ✓ No code files exceed 100 KB. Great job!"));
  } else {
    const largeFilesTable = new Table({
      head: [chalk.cyan("File Path"), chalk.cyan("Size")],
      colWidths: [90, 15],
      style: { head: [], border: [] },
    });
    codeFilesAbove100KB.forEach((file) => {
      largeFilesTable.push([
        chalk.white(formatFilePath(file[0], 85)),
        chalk.red((file[1] / 1024).toFixed(2) + " KB"),
      ]);
    });
    console.log(largeFilesTable.toString());
  }
  console.log(
    chalk.green("════════════════════════════════════════════════\n")
  );
}

function dependenciesSummary(chalk) {
  const { codeGraph, imageGraph } = readCacheAndHydrateGraph();

  // Check if data is available
  const hasData = codeGraph.graph.size > 0 || imageGraph.graph.size > 0;
  if (!hasData) {
    console.log(chalk.yellow.bold("\n⚠️  No Project Data Found"));
    console.log(
      chalk.yellow("════════════════════════════════════════════════")
    );
    console.log(chalk.yellow("   Run a scan to analyze your project first."));
    console.log(
      chalk.yellow("   Use the scan command to generate project data.\n")
    );
    return;
  }

  const top10FilesWithHeavyDependencies = getTop10FilesWithHeavyDependencies(
    codeGraph.graph
  );
  const top10FilesWithLightDependencies = getTop10FilesWithLightDependencies(
    codeGraph.graph
  );
  const top10FilesHotspots = getTop10FilesDependenciesHotspots(codeGraph.graph, false);
  const top10FilesDependenciesHotspots = getTop10FilesDependenciesHotspots(codeGraph.graph);
  // image graph
  const { deadLinks, aliveLinks } = getDeadLinks(imageGraph.graph);
  const top10FilesHotspotsDeadImage = getTop10FilesHotspots(deadLinks);
  const top10FilesHotspotsAliveImage = getTop10FilesHotspots(aliveLinks, false);

  console.log(chalk.green.bold("\n📊 Dependencies Summary"));
  console.log(chalk.green("════════════════════════════════════════════════"));

  // Top 10 Files with Heavy Dependencies
  console.log(chalk.green.bold("\n🔴 Top 10 Files with Heavy Dependencies"));
  console.log(chalk.green("════════════════════════════════════════════════"));
  if (
    !top10FilesWithHeavyDependencies ||
    top10FilesWithHeavyDependencies.length === 0
  ) {
    console.log(chalk.yellow("   No files with heavy dependencies found."));
  } else {
    const heavyDepsTable = new Table({
      head: [chalk.cyan("File Path"), chalk.cyan("Imports")],
      colWidths: [90, 12],
      style: { head: [], border: [] },
    });
    top10FilesWithHeavyDependencies.forEach(([filePath, node]) => {
      heavyDepsTable.push([
        chalk.white(formatFilePath(filePath, 85)),
        chalk.red((node.imports?.size || 0).toString()),
      ]);
    });
    console.log(heavyDepsTable.toString());
  }
  console.log(chalk.green("════════════════════════════════════════════════"));

  // Top 10 Files with Light Dependencies
  console.log(chalk.green.bold("\n🟢 Top 10 Files with Light Dependencies"));
  console.log(chalk.green("════════════════════════════════════════════════"));
  if (
    !top10FilesWithLightDependencies ||
    top10FilesWithLightDependencies.length === 0
  ) {
    console.log(chalk.yellow("   No files with light dependencies found."));
  } else {
    const lightDepsTable = new Table({
      head: [chalk.cyan("File Path"), chalk.cyan("Imports")],
      colWidths: [90, 12],
      style: { head: [], border: [] },
    });
    top10FilesWithLightDependencies.forEach(([filePath, node]) => {
      lightDepsTable.push([
        chalk.white(formatFilePath(filePath, 85)),
        chalk.green((node.imports?.size || 0).toString()),
      ]);
    });
    console.log(lightDepsTable.toString());
  }
  console.log(chalk.green("════════════════════════════════════════════════"));

  // Top 10 Files Hotspots (Most Imported Files)
  console.log(chalk.green.bold("\n🔥 Top 10 File Hotspots (Most Imported)"));
  console.log(chalk.green("════════════════════════════════════════════════"));
  if (!top10FilesHotspots || top10FilesHotspots.length === 0) {
    console.log(chalk.yellow("   No file hotspots found."));
  } else {
    const hotspotsTable = new Table({
      head: [chalk.cyan("File Path"), chalk.cyan("Imported By")],
      colWidths: [90, 15],
      style: { head: [], border: [] },
    });
    top10FilesHotspots.forEach(([filePath, node]) => {
      hotspotsTable.push([
        chalk.white(formatFilePath(filePath, 85)),
        chalk.magenta((node.importedBy?.size || 0).toString()),
      ]);
    });
    console.log(hotspotsTable.toString());
  }
  console.log(chalk.green("════════════════════════════════════════════════"));

  // Top 10 Files Dependencies Hotspots
  console.log(chalk.green.bold("\n📦 Top 10 Files Dependencies Hotspots"));
  console.log(chalk.green("════════════════════════════════════════════════"));
  if (
    !top10FilesDependenciesHotspots ||
    top10FilesDependenciesHotspots.length === 0
  ) {
    console.log(chalk.yellow("   No dependency hotspots found."));
  } else {
    const dependenciesHotspotsTable = new Table({
      head: [chalk.cyan("File Path"), chalk.cyan("Dependencies")],
      colWidths: [90, 15],
      style: { head: [], border: [] },
    });
    top10FilesDependenciesHotspots.forEach(([filePath, node]) => {
      dependenciesHotspotsTable.push([
        chalk.white(formatFilePath(filePath, 85)),
        chalk.yellow((node.importedBy?.size || 0).toString()),
      ]);
    });
    console.log(dependenciesHotspotsTable.toString());
  }
  console.log(chalk.green("════════════════════════════════════════════════"));

  // Image Hotspots - Dead Links
  console.log(chalk.green.bold("\n🖼️  Top 10 Dead Image Hotspots"));
  console.log(chalk.green("════════════════════════════════════════════════"));
  if (
    !top10FilesHotspotsDeadImage ||
    top10FilesHotspotsDeadImage.length === 0
  ) {
    console.log(chalk.green("   ✓ No dead image hotspots found."));
  } else {
    const deadImageHotspotsTable = new Table({
      head: [chalk.cyan("File Path"), chalk.cyan("Referenced By")],
      colWidths: [90, 15],
      style: { head: [], border: [] },
    });
    top10FilesHotspotsDeadImage.forEach(([filePath, node]) => {
      deadImageHotspotsTable.push([
        chalk.white(formatFilePath(filePath, 85)),
        chalk.red((node.importedBy?.size || 0).toString()),
      ]);
    });
    console.log(deadImageHotspotsTable.toString());
  }
  console.log(chalk.green("════════════════════════════════════════════════"));

  // Image Hotspots - Alive Links
  console.log(chalk.green.bold("\n✅ Top 10 Alive Image Hotspots"));
  console.log(chalk.green("════════════════════════════════════════════════"));
  if (
    !top10FilesHotspotsAliveImage ||
    top10FilesHotspotsAliveImage.length === 0
  ) {
    console.log(chalk.yellow("   No alive image hotspots found."));
  } else {
    const aliveImageHotspotsTable = new Table({
      head: [chalk.cyan("File Path"), chalk.cyan("Referenced By")],
      colWidths: [90, 15],
      style: { head: [], border: [] },
    });
    top10FilesHotspotsAliveImage.forEach(([filePath, node]) => {
      aliveImageHotspotsTable.push([
        chalk.white(formatFilePath(filePath, 85)),
        chalk.green((node.importedBy?.size || 0).toString()),
      ]);
    });
    console.log(aliveImageHotspotsTable.toString());
  }
  console.log(
    chalk.green("════════════════════════════════════════════════\n")
  );
}
module.exports = {
  summarizeAll,
  getTop10LargestFiles,
  dependenciesSummary,
  formatFilePath,
};
