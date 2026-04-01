/**
 * `ctxlens watch` command.
 *
 * Monitors a directory for file changes and re-runs the token budget
 * analysis on each change. Shows a persistent status line in the terminal.
 * Useful during development to keep an eye on context window utilization.
 */

import { resolve, basename } from "node:path";
import { watch } from "node:fs";
import { Command } from "commander";
import chalk from "chalk";
import { scanDirectory } from "../core/scanner.js";
import { countTokens, freeEncoders } from "../core/tokenizer.js";
import { getModel, getAllModels, registerCustomModels } from "../core/models.js";
import { computeBudget, checkMultiModelBudget } from "../core/budget.js";
import type { FileTokenInfo, BudgetStatus } from "../core/budget.js";
import { loadConfig } from "../utils/config.js";
import { formatTokens } from "../utils/format.js";

function statusIcon(status: BudgetStatus): string {
  switch (status) {
    case "fits": return chalk.green("✓");
    case "tight": return chalk.yellow("⚠");
    case "exceeds": return chalk.red("✗");
  }
}

function statusColor(status: BudgetStatus): typeof chalk {
  switch (status) {
    case "fits": return chalk.green;
    case "tight": return chalk.yellow;
    case "exceeds": return chalk.red;
  }
}

export const watchCommand = new Command("watch")
  .description("Monitor token budget in real-time during development")
  .argument("[path]", "directory to watch", ".")
  .option("-m, --model <name>", "target model for budget calculation", "claude-sonnet-4-6")
  .option("--threshold <pct>", "warn when utilization exceeds this percentage", "80")
  .action(async (path: string, opts) => {
    const rootPath = resolve(path);
    const config = loadConfig(rootPath);
    registerCustomModels(config);

    const modelId =
      opts.model !== "claude-sonnet-4-6"
        ? opts.model
        : process.env.CTXLENS_MODEL ?? config.defaultModel ?? "claude-sonnet-4-6";
    const maybeModel = getModel(modelId);

    if (!maybeModel) {
      console.error(`Unknown model: ${modelId}. Run 'ctxlens models' to see available models.`);
      process.exit(1);
      return;
    }

    const model = maybeModel;

    const threshold = parseInt(opts.threshold, 10) / 100;

    console.log("");
    console.log(chalk.bold("  ctxlens watch") + chalk.dim(` — monitoring ${basename(rootPath)}`));
    console.log(chalk.dim(`  Model: ${model.id} (${formatTokens(model.contextWindow)} tokens)`));
    console.log(chalk.dim(`  Threshold: ${(threshold * 100).toFixed(0)}%`));
    console.log(chalk.dim("  Press Ctrl+C to stop"));
    console.log("");

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let scanCount = 0;

    function runScan(): void {
      scanCount++;
      const timestamp = new Date().toLocaleTimeString();

      const files = scanDirectory(rootPath, {
        respectGitignore: true,
        extraIgnore: config.ignore ?? [],
        include: config.include ?? [],
        exclude: [],
      });

      const fileTokens: FileTokenInfo[] = files.map((f) => ({
        relativePath: f.relativePath,
        tokens: countTokens(f.content, model.tokenizer),
        lines: f.lines,
      }));

      const result = computeBudget(fileTokens, model, 3);
      const icon = statusIcon(result.status);
      const color = statusColor(result.status);
      const pct = (result.utilization * 100).toFixed(1);

      // Clear previous line and write status
      const line = `  ${icon} ${color(`${formatTokens(result.totalTokens)} tokens`)} (${pct}% of ${model.id}) — ${result.totalFiles} files ${chalk.dim(`[${timestamp}]`)}`;

      if (scanCount > 1) {
        // Move cursor up and clear the line for updates
        process.stdout.write("\x1b[1A\x1b[2K");
      }
      console.log(line);

      // Alert if threshold exceeded
      if (result.utilization > threshold && scanCount > 1) {
        console.log(chalk.yellow(`  ⚠ Budget at ${pct}% — exceeds ${(threshold * 100).toFixed(0)}% threshold`));
      }

      freeEncoders();
    }

    // Initial scan
    runScan();

    // Watch for changes with debouncing
    const watcher = watch(rootPath, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      // Skip irrelevant changes
      if (
        filename.includes("node_modules") ||
        filename.includes(".git/") ||
        filename.includes("dist/") ||
        filename.startsWith(".")
      ) {
        return;
      }

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runScan, 300);
    });

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      watcher.close();
      console.log(chalk.dim("\n  Watch stopped."));
      process.exit(0);
    });
  });
