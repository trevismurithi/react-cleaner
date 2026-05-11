#!/usr/bin/env node
/**
 * Generates the PR health report body from qleaner.stats.json.
 * Called by the CI workflow; writes report.md to stdout or a file.
 *
 * Usage: node .github/scripts/pr-report.js <stats-file> <summary-file>
 */

const fs = require("fs");
const path = require("path");

const statsPath = process.argv[2] || "qleaner.stats.json";
const summaryPath = process.argv[3] || "health_summary.txt";

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

// Sessions from the last 2 sessions (this PR run can produce 2–3 sub-sessions
// from tidy: prune-logs, prune-unused, duplicates, unused-exports)
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

#### Repository hotspots
\`\`\`
${summaryText}
\`\`\`

<sub>Maintained by [Qleaner](https://github.com/trevis/react-cleaner) v1.3.3</sub>`;

process.stdout.write(body);
