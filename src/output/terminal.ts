import chalk from "chalk";
import type { BudgetResult } from "../core/budget.js";
import type { ModelInfo } from "../core/models.js";
import type { BudgetStatus } from "../core/budget.js";

const BAR_WIDTH = 18;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function renderBar(ratio: number): string {
  const filled = Math.round(ratio * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

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

export function renderTerminal(
  result: BudgetResult,
  topN: number,
  multiModel?: Array<{ model: ModelInfo; utilization: number; status: BudgetStatus }>,
): string {
  const lines: string[] = [];
  const { model, totalTokens, totalFiles, utilization, directories, files } = result;

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
  const topDirs = directories.slice(0, topN);
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
  const topFiles = files.slice(0, topN);
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
    for (const entry of multiModel) {
      lines.push(`  ${statusLabel(entry.status, entry.model, entry.utilization)}`);
    }
  } else {
    lines.push(`  ${statusLabel(result.status, model, utilization)}`);
  }

  lines.push("");
  return lines.join("\n");
}
