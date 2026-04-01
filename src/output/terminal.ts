/**
 * Rich terminal renderer for ctxlens.
 *
 * Produces colored, scannable output designed for a developer sitting in their
 * terminal. Includes bar charts for directory breakdown, a ranked file list,
 * and a multi-model budget status section with fit/tight/exceeds indicators.
 *
 * Visual design references: tokei (code stats), dust (disk usage), bat (file viewer).
 */

import chalk from "chalk";
import type { BudgetResult } from "../core/budget.js";
import type { ModelInfo } from "../core/models.js";
import type { BudgetStatus } from "../core/budget.js";
import { formatTokens } from "../utils/format.js";

/** Width of the bar chart in characters. */
const BAR_WIDTH = 18;

/** Renders a proportional bar using filled/empty block characters. */
function renderBar(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

/** Returns a colored status icon for the given budget status. */
function statusIcon(status: BudgetStatus): string {
  switch (status) {
    case "fits":
      return chalk.green("✓");
    case "tight":
      return chalk.yellow("⚠");
    case "exceeds":
      return chalk.red("✗");
  }
}

/** Formats a single line of the budget status section for one model. */
function statusLabel(status: BudgetStatus, model: ModelInfo, utilization: number): string {
  const name = model.id;
  const window = formatTokens(model.contextWindow);
  const pct = `${(utilization * 100).toFixed(1)}%`;

  switch (status) {
    case "fits":
      return `${statusIcon(status)} ${chalk.green("Fits in context:")} ${name} (${window}) — ${pct}`;
    case "tight":
      return `${statusIcon(status)} ${chalk.yellow("Tight fit:")}      ${name} (${window}) — ${pct}`;
    case "exceeds":
      return `${statusIcon(status)} ${chalk.red("Exceeds:")}        ${name} (${window}) — ${pct}`;
  }
}

/**
 * Renders a complete terminal report from a budget analysis result.
 *
 * Output sections:
 * 1. Header — tool name, target model, file count, total tokens
 * 2. Top directories — bar chart showing token distribution by directory
 * 3. Largest files — ranked list of individual files by token count
 * 4. Budget status — per-model fit/tight/exceeds indicators
 *
 * @param result     - The budget analysis result to render.
 * @param topN       - How many entries to show in the top dirs/files lists.
 * @param multiModel - Optional multi-model budget check for the status section.
 * @returns A ready-to-print string (includes newlines and ANSI color codes).
 */
export type SortKey = "tokens" | "files" | "name";

export function renderTerminal(
  result: BudgetResult,
  topN: number,
  multiModel?: Array<{ model: ModelInfo; utilization: number; status: BudgetStatus }>,
  sort: SortKey = "tokens",
): string {
  const lines: string[] = [];
  const { model, totalTokens, totalFiles, utilization } = result;

  // Apply sort
  const directories = [...result.directories].sort((a, b) => {
    if (sort === "name") return a.path.localeCompare(b.path);
    if (sort === "files") return b.files - a.files;
    return b.tokens - a.tokens;
  });
  const files = [...result.files].sort((a, b) => {
    if (sort === "name") return a.relativePath.localeCompare(b.relativePath);
    return b.tokens - a.tokens;
  });

  lines.push("");
  lines.push(chalk.bold("  ctxlens") + chalk.dim(" — Token Budget Analyzer"));
  lines.push("");
  lines.push(`  Model: ${chalk.cyan(model.id)} (${formatTokens(model.contextWindow)} tokens)`);
  lines.push(`  Scanned: ${chalk.bold(String(totalFiles))} files`);
  lines.push(
    `  Total tokens: ${chalk.bold(formatTokens(totalTokens))} (${(utilization * 100).toFixed(1)}% of context window)`,
  );
  lines.push("");

  // Top directories
  lines.push(chalk.dim("  ── Top directories by token count ") + chalk.dim("─".repeat(30)));
  lines.push("");
  const topDirs = topN === 0 ? directories : directories.slice(0, topN);
  const maxDirTokens = topDirs[0]?.tokens ?? 1;
  for (const dir of topDirs) {
    const ratio = dir.tokens / maxDirTokens;
    const pct = ((dir.tokens / totalTokens) * 100).toFixed(1);
    const name = dir.path.padEnd(24);
    const tkStr = `${formatTokens(dir.tokens)} tk`.padStart(10);
    lines.push(`  ${name} ${tkStr}  ${chalk.cyan(renderBar(ratio))}  ${pct}%`);
  }
  lines.push("");

  // Top files
  lines.push(chalk.dim("  ── Largest files ") + chalk.dim("─".repeat(46)));
  lines.push("");
  const topFiles = topN === 0 ? files : files.slice(0, topN);
  for (const file of topFiles) {
    const pct = ((file.tokens / totalTokens) * 100).toFixed(1);
    const name = file.relativePath.padEnd(40);
    const tkStr = `${formatTokens(file.tokens)} tk`.padStart(10);
    lines.push(`  ${name} ${tkStr}  (${pct}%)`);
  }
  lines.push("");

  // Budget status
  lines.push(chalk.dim("  ── Budget status ") + chalk.dim("─".repeat(46)));
  lines.push("");

  if (multiModel && multiModel.length > 0) {
    const statuses = new Set(multiModel.map((e) => e.status));

    if (statuses.size === 1) {
      // All models have the same status — show a single summary line
      const status = multiModel[0].status;
      const icon = statusIcon(status);
      const label =
        status === "fits"
          ? chalk.green(`Fits all ${multiModel.length} models`)
          : status === "tight"
            ? chalk.yellow(`Tight fit across all ${multiModel.length} models`)
            : chalk.red(`Exceeds all ${multiModel.length} models`);
      lines.push(`  ${icon} ${label}`);
    } else {
      // Mixed statuses — group by status, show condensed per group + expanded exceptions
      const fits = multiModel.filter((e) => e.status === "fits");
      const tight = multiModel.filter((e) => e.status === "tight");
      const exceeds = multiModel.filter((e) => e.status === "exceeds");

      if (fits.length > 0) {
        if (fits.length <= 3) {
          for (const entry of fits) {
            lines.push(`  ${statusLabel(entry.status, entry.model, entry.utilization)}`);
          }
        } else {
          lines.push(`  ${statusIcon("fits")} ${chalk.green(`Fits ${fits.length} models`)}`);
        }
      }
      for (const entry of tight) {
        lines.push(`  ${statusLabel(entry.status, entry.model, entry.utilization)}`);
      }
      for (const entry of exceeds) {
        lines.push(`  ${statusLabel(entry.status, entry.model, entry.utilization)}`);
      }
    }
  } else {
    lines.push(`  ${statusLabel(result.status, model, utilization)}`);
  }

  lines.push("");
  return lines.join("\n");
}

/** Entry for a single file in the tokenizer comparison table. */
export interface CompareEntry {
  relativePath: string;
  tokenCounts: Record<string, number>;
}

/**
 * Renders a side-by-side tokenizer comparison table.
 *
 * Shows how token counts differ across encodings for the top N files,
 * plus totals. Helps developers understand how model choice affects
 * their token budget.
 *
 * @param entries   - Per-file token counts keyed by encoding name.
 * @param encodings - Ordered list of encoding names to display as columns.
 * @param topN      - How many files to show.
 */
export function renderCompare(
  entries: CompareEntry[],
  encodings: string[],
  topN: number,
): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(chalk.bold("  ctxlens") + chalk.dim(" — Tokenizer Comparison"));
  lines.push("");

  // Header row
  const headerName = "  File".padEnd(40);
  const headerCols = encodings.map((e) => e.padStart(14)).join("");
  const headerDiff = "    diff".padStart(10);
  lines.push(chalk.bold(headerName + headerCols + headerDiff));
  lines.push(chalk.dim("  " + "─".repeat(38 + encodings.length * 14 + 10)));

  // Sort by largest difference
  const sorted = [...entries].sort((a, b) => {
    const aVals = Object.values(a.tokenCounts);
    const bVals = Object.values(b.tokenCounts);
    const aDiff = Math.max(...aVals) - Math.min(...aVals);
    const bDiff = Math.max(...bVals) - Math.min(...bVals);
    return bDiff - aDiff;
  });

  const topEntries = topN === 0 ? sorted : sorted.slice(0, topN);

  for (const entry of topEntries) {
    const name = `  ${entry.relativePath}`.padEnd(40).slice(0, 40);
    const cols = encodings
      .map((e) => formatTokens(entry.tokenCounts[e] ?? 0).padStart(14))
      .join("");
    const vals = encodings.map((e) => entry.tokenCounts[e] ?? 0);
    const diff = Math.max(...vals) - Math.min(...vals);
    const diffPct =
      vals[0] > 0 ? ((diff / vals[0]) * 100).toFixed(1) + "%" : "—";
    const diffStr = diff > 0 ? chalk.yellow(`±${diffPct}`.padStart(10)) : chalk.dim("—".padStart(10));
    lines.push(name + cols + diffStr);
  }

  // Totals
  lines.push(chalk.dim("  " + "─".repeat(38 + encodings.length * 14 + 10)));
  const totalName = chalk.bold("  TOTAL".padEnd(40));
  const totalCols = encodings
    .map((e) => {
      const total = entries.reduce((sum, entry) => sum + (entry.tokenCounts[e] ?? 0), 0);
      return chalk.bold(formatTokens(total).padStart(14));
    })
    .join("");
  const totalVals = encodings.map((e) =>
    entries.reduce((sum, entry) => sum + (entry.tokenCounts[e] ?? 0), 0),
  );
  const totalDiff = Math.max(...totalVals) - Math.min(...totalVals);
  const totalDiffPct =
    totalVals[0] > 0 ? ((totalDiff / totalVals[0]) * 100).toFixed(1) + "%" : "—";
  const totalDiffStr =
    totalDiff > 0 ? chalk.yellow(`±${totalDiffPct}`.padStart(10)) : chalk.dim("—".padStart(10));
  lines.push(totalName + totalCols + totalDiffStr);

  lines.push("");
  return lines.join("\n");
}
