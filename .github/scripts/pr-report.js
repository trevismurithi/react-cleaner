#!/usr/bin/env node
/**
 * Generates the PR health report body from qleaner.stats.json.
 * Called by the CI workflow; writes report.md to stdout or a file.
 *
 * Usage: node .github/scripts/pr-report.js <stats-file> <summary-file> [tidy-report-file] [image-report-file]
 * Legacy 3-file form (no tidy path): ... <stats> <summary> <image-report-file>
 */

const fs = require("fs");
const path = require("path");
const { FIX_PASS_KEYS } = require(path.join(__dirname, "../../utils/cache"));

const statsPath = process.argv[2] || "qleaner.stats.json";
const summaryPath = process.argv[3] || "health_summary.txt";

/** When argv has both tidy + image paths (length >= 6), argv[4]=tidy, argv[5]=image. Else argv[4] is image only. */
let tidyReportPath;
let imageReportPath;
if (process.argv.length >= 6) {
  tidyReportPath = process.argv[4];
  imageReportPath = process.argv[5];
} else if (process.argv.length === 5) {
  tidyReportPath = "tidy_report.txt";
  imageReportPath = process.argv[4];
} else {
  tidyReportPath = "tidy_report.txt";
  imageReportPath = "image_report.txt";
}

/** Max chars of captured CLI output in the PR body (GitHub comment size limits). */
const CLI_REPORT_MAX_CHARS = 12000;

// ── helpers ───────────────────────────────────────────────────────────────────

function normalize(v) {
  return {
    items: v.totalItemsRemoved ?? v.removedItems ?? v.removedCount ?? 0,
    lines: v.totalLinesRemoved ?? v.removedLines ?? v.locRemoved ?? 0,
    bytes: v.bytesSaved ?? v.removedBytes ?? (v.kbSaved ? parseFloat(v.kbSaved) * 1024 : 0),
    files: v.filesModified ?? v.modifiedFiles ?? 0,
    hours: v.estimatedDeveloperHoursSaved ?? (v.timeSaved ? parseFloat(v.timeSaved) : 0),
  };
}

/** Unicode block bar — max 20 chars wide. */
function bar(value, max) {
  if (max === 0) return "░".repeat(20);
  const filled = Math.round((value / max) * 20);
  return "█".repeat(filled) + "░".repeat(20 - filled);
}

function fmt(n) {
  return n.toLocaleString("en-US");
}

// ── load data ─────────────────────────────────────────────────────────────────

if (!fs.existsSync(statsPath)) {
  console.log("Stats file not found — skipping report.");
  process.exit(0);
}

const stats = JSON.parse(fs.readFileSync(statsPath, "utf8"));
const raw = stats.fileAssociatedStats || {};
const trashStats = stats.statistics || {};

// All-time totals across every session ever
const allSessions = Object.entries(raw)
  .map(([k, v]) => ({ ts: new Date(k), ...normalize(v) }))
  .sort((a, b) => a.ts - b.ts);

const totals = allSessions.reduce(
  (acc, s) => ({
    items: acc.items + s.items,
    lines: acc.lines + s.lines,
    bytes: acc.bytes + s.bytes,
    hours: acc.hours + s.hours,
  }),
  { items: 0, lines: 0, bytes: 0, hours: 0 }
);

// Last few non-empty sessions (e.g. local or CI tidy with --auto-fix); CI dry-run tidy does not bump these.
const recentSessions = allSessions.slice(-4).filter((s) => s.items > 0 || s.lines > 0);
const thisRun = recentSessions.reduce(
  (acc, s) => ({
    items: acc.items + s.items,
    lines: acc.lines + s.lines,
    bytes: acc.bytes + s.bytes,
    hours: acc.hours + s.hours,
    files: acc.files + s.files,
  }),
  { items: 0, lines: 0, bytes: 0, hours: 0, files: 0 }
);

// Trash deletions
const trashSessions = Object.values(trashStats);
const trashTotals = trashSessions.reduce(
  (acc, s) => ({ files: acc.files + (s.filesDeleted || 0), bytes: acc.bytes + (s.bytesSaved || 0) }),
  { files: 0, bytes: 0 }
);

// Per-day buckets for sparkline (last 7 active days)
const byDay = new Map();
for (const s of allSessions) {
  const day = s.ts.toISOString().slice(0, 10);
  const e = byDay.get(day) ?? { items: 0, lines: 0 };
  e.items += s.items;
  e.lines += s.lines;
  byDay.set(day, e);
}
const last7 = Array.from(byDay.entries())
  .sort(([a], [b]) => a.localeCompare(b))
  .slice(-7);

const maxItems = Math.max(...last7.map(([, v]) => v.items), 1);

// ── summary text ──────────────────────────────────────────────────────────────

const summaryText = fs.existsSync(summaryPath)
  ? fs.readFileSync(summaryPath, "utf8").trim()
  : "_Summary not available. Run `qleaner summary` locally._";

const CACHE_FILE = path.join(process.cwd(), "unused-check-cache.json");

function buildCacheSnapshotSection() {
  if (!fs.existsSync(CACHE_FILE)) {
    return "_`unused-check-cache.json` not found after this run._";
  }
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    const parent = cache.parentGraph || {};
    const imageParent = cache.imageParentGraph || {};
    const graphNodeCount = parent.graph ? Object.keys(parent.graph).length : 0;
    const unusedFilesCount = Array.isArray(parent.unusedFiles)
      ? parent.unusedFiles.length
      : 0;
    const imageGraphCount = imageParent.imageGraph
      ? Object.keys(imageParent.imageGraph).length
      : 0;
    const unusedImagesCount = Array.isArray(imageParent.unusedImages)
      ? imageParent.unusedImages.length
      : 0;

    const lines = [
      `- **Code graph nodes:** ${fmt(graphNodeCount)}`,
      `- **Unused files (cached list):** ${fmt(unusedFilesCount)}`,
      `- **Image graph nodes:** ${fmt(imageGraphCount)}`,
      `- **Unused images (cached list):** ${fmt(unusedImagesCount)}`,
    ];

    const fixes = parent.fixes;
    if (fixes && typeof fixes === "object") {
      lines.push(
        "- **Surgical pass fingerprints** (JSON path **parentGraph.fixes**):",
      );
      for (const passKey of FIX_PASS_KEYS) {
        const bucket = fixes[passKey];
        const fingerprintCount =
          bucket && typeof bucket === "object"
            ? Object.keys(bucket).length
            : 0;
        lines.push(`  - **${passKey}**: ${fmt(fingerprintCount)} file(s)`);
      }
    }

    return lines.join("\n");
  } catch {
    return "_Could not parse `unused-check-cache.json`._";
  }
}

const cacheSnapshotSection = buildCacheSnapshotSection();

function buildCliCaptureSection(labelNotFound, labelEmpty, filePath) {
  if (!fs.existsSync(filePath)) {
    return `_${labelNotFound}_`;
  }
  let text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) {
    return `_${labelEmpty}_`;
  }
  let note = "";
  if (text.length > CLI_REPORT_MAX_CHARS) {
    note = `_(Truncated; first ${CLI_REPORT_MAX_CHARS.toLocaleString("en-US")} characters.)_\n\n`;
    text = text.slice(0, CLI_REPORT_MAX_CHARS);
  }
  return `${note}\`\`\`\n${text}\n\`\`\``;
}

const tidyReportSection = buildCliCaptureSection(
  "Tidy report file not found.",
  "Tidy produced no output.",
  tidyReportPath,
);
const imageReportSection = buildCliCaptureSection(
  "Image report file not found.",
  "Image scan produced no output.",
  imageReportPath,
);

// ── build report ──────────────────────────────────────────────────────────────

const noChanges = thisRun.items === 0 && thisRun.lines === 0;

const runBlock = noChanges
  ? "> No code changes were needed — the codebase is already clean."
  : `| Metric | This PR |
| --- | --- |
| Items removed | **${fmt(thisRun.items)}** |
| Lines pruned | **${fmt(thisRun.lines)}** |
| Bytes saved | **${fmt(Math.round(thisRun.bytes))}** (${(thisRun.bytes / 1024).toFixed(1)} KB) |
| Files modified | **${fmt(thisRun.files)}** |
| Dev time reclaimed | **${thisRun.hours.toFixed(2)} hrs** |`;

const sparkLines = last7
  .map(([day, v]) => `\`${day.slice(5)}\` ${bar(v.items, maxItems)} ${fmt(v.items)}`)
  .join("\n");

const body = `<!-- qleaner-report -->
### Qleaner Health Guardian

${noChanges ? "**No changes needed** — code is clean." : `**${fmt(thisRun.items)} items** cleaned up on this PR.`}

#### This PR run
${runBlock}

#### All-time project totals
| Items removed | Lines pruned | Bytes saved | Files deleted | Dev hrs reclaimed |
| --- | --- | --- | --- | --- |
| ${fmt(totals.items)} | ${fmt(totals.lines)} | ${(totals.bytes / 1024).toFixed(1)} KB | ${fmt(trashTotals.files)} | ${totals.hours.toFixed(1)} hrs |

#### Items removed — last 7 active days
\`\`\`
${sparkLines}
\`\`\`

#### Cache snapshot
${cacheSnapshotSection}

#### Tidy pipeline (dry-run only, no --auto-fix)
${tidyReportSection}

#### Image scan (dry-run, table)
${imageReportSection}

#### Repository hotspots
\`\`\`
${summaryText}
\`\`\`

<sub>Maintained by [Qleaner](https://github.com/trevis/react-cleaner) v1.3.3</sub>`;

process.stdout.write(body);
