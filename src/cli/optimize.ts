/**
 * `ctxlens optimize` command.
 *
 * Analyzes the codebase and suggests ways to reduce token consumption.
 * Flags oversized files, comment-heavy files, test file weight, and
 * highlights type-dense files as efficient for AI context.
 */

import { resolve } from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { scanDirectory } from "../core/scanner.js";
import { countTokens, freeEncoders } from "../core/tokenizer.js";
import { getModel, registerCustomModels } from "../core/models.js";
import type { FileTokenInfo } from "../core/budget.js";
import { analyze } from "../core/optimizer.js";
import type { Suggestion } from "../core/optimizer.js";
import { loadConfig } from "../utils/config.js";
import { formatTokens } from "../utils/format.js";

function severityIcon(severity: Suggestion["severity"]): string {
  switch (severity) {
    case "warning":
      return chalk.yellow("⚠");
    case "optimization":
      return chalk.cyan("◆");
    case "info":
      return chalk.green("✓");
  }
}

export const optimizeCommand = new Command("optimize")
  .description("Analyze codebase and suggest ways to reduce token usage")
  .argument("[path]", "directory to analyze", ".")
  .option("-m, --model <name>", "target model for tokenization", "claude-sonnet-4-6")
  .action(async (path: string, opts) => {
    const rootPath = resolve(path);
    const config = loadConfig(rootPath);
    registerCustomModels(config);

    const modelId =
      opts.model !== "claude-sonnet-4-6"
        ? opts.model
        : process.env.CTXLENS_MODEL ?? config.defaultModel ?? "claude-sonnet-4-6";
    const model = getModel(modelId);

    if (!model) {
      console.error(`Unknown model: ${modelId}. Run 'ctxlens models' to see available models.`);
      process.exit(1);
    }

    const files = scanDirectory(rootPath, {
      respectGitignore: true,
      extraIgnore: config.ignore ?? [],
      include: config.include ?? [],
      exclude: [],
    });

    const contents = new Map<string, string>();
    const fileTokens: FileTokenInfo[] = files.map((f) => {
      contents.set(f.relativePath, f.content);
      return {
        relativePath: f.relativePath,
        tokens: countTokens(f.content, model.tokenizer),
        lines: f.lines,
      };
    });

    const totalTokens = fileTokens.reduce((sum, f) => sum + f.tokens, 0);
    const suggestions = analyze(fileTokens, contents, totalTokens);

    console.log("");
    console.log(chalk.bold("  ctxlens optimize") + chalk.dim(` — ${fileTokens.length} files, ${formatTokens(totalTokens)} tokens`));
    console.log("");

    if (suggestions.length === 0) {
      console.log(chalk.green("  ✓ No optimization suggestions — your codebase is lean."));
      console.log("");
      freeEncoders();
      return;
    }

    // Group by severity
    const warnings = suggestions.filter((s) => s.severity === "warning");
    const optimizations = suggestions.filter((s) => s.severity === "optimization");
    const infos = suggestions.filter((s) => s.severity === "info");

    for (const group of [warnings, optimizations, infos]) {
      for (const suggestion of group) {
        const icon = severityIcon(suggestion.severity);
        const tkStr = formatTokens(suggestion.tokens);
        console.log(`  ${icon} ${chalk.bold(suggestion.file)} (${tkStr})`);
        console.log(`    ${suggestion.message}`);
        console.log(chalk.dim(`    → ${suggestion.detail}`));
        console.log("");
      }
    }

    freeEncoders();
  });
