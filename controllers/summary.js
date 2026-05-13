const fs = require("fs");
const path = require("path");
const Table = require("cli-table3");
const { hydrateGraph } = require("../utils/graphUtils");
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
  getTop10FilesDependenciesHotspots,
  getTop10FilesWithMostReexports,
  getTop10FilesWithMostReexportedBy,
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
  } catch {
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
}

function getTop10LargestFiles(chalk) {
  const { codeGraph, imageGraph } = readCacheAndHydrateGraph();
  const totalCodeSize = getTotalCodeSize(codeGraph.graph);
  const totalImageSize = getTotalImageSize(imageGraph.graph);
  const top10CodeFiles = getTop10LargestCodeFiles(codeGraph.graph);
  const top10ImageFiles = getTop10LargestImages(imageGraph.graph, false);
  const codeFilesAbove100KB = findCodeFilesAbove100KB(codeGraph.graph);

  // Top 10 Largest Code Files
  if (!top10CodeFiles || top10CodeFiles.length === 0) {
  } else {
    const codeTable = new Table({
      head: [chalk.cyan("File Path"), chalk.cyan("Size")],
      colWidths: [90, 15],
      style: { head: [], border: [] },
    });
    top10CodeFiles.forEach((file) => {
      codeTable.push([
        chalk.white(formatFilePath(file[0], 85)),
        chalk.magenta((file[1] / 1024).toFixed(2) + " KB"),
      ]);
    });
  }
  // Top 10 Largest Image Files
  if (!top10ImageFiles || top10ImageFiles.length === 0) {
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
  }
  // Total Sizes Summary
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
  // Code Files Above 100 KB
  if (!codeFilesAbove100KB || codeFilesAbove100KB.length === 0) {
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
  }
}

function printSectionHeader(chalk, title) {
}

function printSectionFooter(chalk) {
}

function displayTableSection(chalk, data, config) {
  const { title, emptyMessage, headers, colWidths, getRowData, emptyMessageColor } = config;
  
  printSectionHeader(chalk, title);
  
  if (!data || data.length === 0) {
    const colorFn = emptyMessageColor || chalk.yellow;
  } else {
    const table = new Table({
      head: headers.map(h => chalk.cyan(h)),
      colWidths,
      style: { head: [], border: [] },
    });
    
    data.forEach((item) => {
      table.push(getRowData(item));
    });
  }
  
  printSectionFooter(chalk);
}

function displayHeavyDependencies(chalk, data) {
  displayTableSection(chalk, data, {
    title: "🔴 Top 10 Files with Heavy Dependencies",
    emptyMessage: "No files with heavy dependencies found.",
    headers: ["File Path", "Imports"],
    colWidths: [90, 12],
    getRowData: ([filePath, node]) => [
      chalk.white(formatFilePath(filePath, 85)),
      chalk.red((node.imports?.size || 0).toString()),
    ],
  });
}

function displayLightDependencies(chalk, data) {
  displayTableSection(chalk, data, {
    title: "🟢 Top 10 Files with Light Dependencies",
    emptyMessage: "No files with light dependencies found.",
    headers: ["File Path", "Imports"],
    colWidths: [90, 12],
    getRowData: ([filePath, node]) => [
      chalk.white(formatFilePath(filePath, 85)),
      chalk.green((node.imports?.size || 0).toString()),
    ],
  });
}

function displayFileHotspots(chalk, data) {
  displayTableSection(chalk, data, {
    title: "🔥 Top 10 File Hotspots (Most Imported)",
    emptyMessage: "No file hotspots found.",
    headers: ["File Path", "Imported By"],
    colWidths: [90, 15],
    getRowData: ([filePath, node]) => [
      chalk.white(formatFilePath(filePath, 85)),
      chalk.magenta((node.importedBy?.size || 0).toString()),
    ],
  });
}

function displayDependencyHotspots(chalk, data) {
  displayTableSection(chalk, data, {
    title: "📦 Top 10 Files Dependencies Hotspots",
    emptyMessage: "No dependency hotspots found.",
    headers: ["File Path", "Dependencies"],
    colWidths: [90, 15],
    getRowData: ([filePath, node]) => [
      chalk.white(formatFilePath(filePath, 85)),
      chalk.yellow((node.importedBy?.size || 0).toString()),
    ],
  });
}

function displayReexports(chalk, data) {
  displayTableSection(chalk, data, {
    title: "📤 Top 10 Files that Export the Most Files",
    emptyMessage: "No files with re-exports found.",
    headers: ["File Path", "Re-exports"],
    colWidths: [90, 15],
    getRowData: ([filePath, node]) => [
      chalk.white(formatFilePath(filePath, 85)),
      chalk.blue((node.reExported?.size || 0).toString()),
    ],
  });
}

function displayReexportedBy(chalk, data) {
  displayTableSection(chalk, data, {
    title: "📥 Top 10 Files that Have Been Exported Most",
    emptyMessage: "No files re-exported by others found.",
    headers: ["File Path", "Re-exported By"],
    colWidths: [90, 15],
    getRowData: ([filePath, node]) => [
      chalk.white(formatFilePath(filePath, 85)),
      chalk.cyan((node.reExportedBy?.size || 0).toString()),
    ],
  });
}

function displayDeadImageHotspots(chalk, data) {
  displayTableSection(chalk, data, {
    title: "🖼️  Top 10 Dead Image Hotspots",
    emptyMessage: "✓ No dead image hotspots found.",
    headers: ["File Path", "Referenced By"],
    colWidths: [90, 15],
    getRowData: ([filePath, node]) => [
      chalk.white(formatFilePath(filePath, 85)),
      chalk.red((node.importedBy?.size || 0).toString()),
    ],
    emptyMessageColor: chalk.green,
  });
}

function displayAliveImageHotspots(chalk, data) {
  displayTableSection(chalk, data, {
    title: "✅ Top 10 Alive Image Hotspots",
    emptyMessage: "No alive image hotspots found.",
    headers: ["File Path", "Referenced By"],
    colWidths: [90, 15],
    getRowData: ([filePath, node]) => [
      chalk.white(formatFilePath(filePath, 85)),
      chalk.green((node.importedBy?.size || 0).toString()),
    ],
  });
}

function checkDataAvailability(chalk, codeGraph, imageGraph) {
  const hasData = codeGraph.graph.size > 0 || imageGraph.graph.size > 0;
  if (!hasData) {
    return false;
  }
  return true;
}

function collectDependencyData(codeGraph, imageGraph) {
  const top10FilesWithHeavyDependencies = getTop10FilesWithHeavyDependencies(
    codeGraph.graph
  );
  const top10FilesWithLightDependencies = getTop10FilesWithLightDependencies(
    codeGraph.graph
  );
  const top10FilesHotspots = getTop10FilesDependenciesHotspots(codeGraph.graph, false);
  const top10FilesDependenciesHotspots = getTop10FilesDependenciesHotspots(codeGraph.graph);
  const top10FilesWithMostReexports = getTop10FilesWithMostReexports(codeGraph.graph);
  const top10FilesWithMostReexportedBy = getTop10FilesWithMostReexportedBy(codeGraph.graph);
  
  const { deadLinks, aliveLinks } = getDeadLinks(imageGraph.graph);
  const top10FilesHotspotsDeadImage = getTop10FilesHotspots(deadLinks);
  const top10FilesHotspotsAliveImage = getTop10FilesHotspots(aliveLinks, false);

  return {
    top10FilesWithHeavyDependencies,
    top10FilesWithLightDependencies,
    top10FilesHotspots,
    top10FilesDependenciesHotspots,
    top10FilesWithMostReexports,
    top10FilesWithMostReexportedBy,
    top10FilesHotspotsDeadImage,
    top10FilesHotspotsAliveImage,
  };
}

function dependenciesSummary(chalk) {
  const { codeGraph, imageGraph } = readCacheAndHydrateGraph();

  if (!checkDataAvailability(chalk, codeGraph, imageGraph)) {
    return;
  }

  const data = collectDependencyData(codeGraph, imageGraph);
  displayHeavyDependencies(chalk, data.top10FilesWithHeavyDependencies);
  displayLightDependencies(chalk, data.top10FilesWithLightDependencies);
  displayFileHotspots(chalk, data.top10FilesHotspots);
  displayDependencyHotspots(chalk, data.top10FilesDependenciesHotspots);
  displayReexports(chalk, data.top10FilesWithMostReexports);
  displayReexportedBy(chalk, data.top10FilesWithMostReexportedBy);
  displayDeadImageHotspots(chalk, data.top10FilesHotspotsDeadImage);
  displayAliveImageHotspots(chalk, data.top10FilesHotspotsAliveImage);
}
module.exports = {
  summarizeAll,
  getTop10LargestFiles,
  dependenciesSummary,
  formatFilePath,
};
