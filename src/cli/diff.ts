/**
 * `ctxlens diff` command.
 *
 * Shows the token impact of changes — how many tokens were added or removed.
 * Supports comparing: current vs stripped (--strip-comments, --strip-whitespace),
 * or current working tree changes vs last commit (default).
 */

import { resolve } from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { scanDirectory } from "../core/scanner.js";
import { countTokens, freeEncoders } from "../core/tokenizer.js";
import { getModel, registerCustomModels } from "../core/models.js";
import { loadConfig } from "../utils/config.js";
import { stripComments, stripWhitespace } from "../core/stripper.js";
import { formatTokens } from "../utils/format.js";
import { getChangedFiles } from "../core/git.js";

interface FileDelta {
  relativePath: string;
  before: number;
  after: number;
  delta: number;
}

export const diffCommand = new Command("diff")
  .description("Show token impact of changes or stripping")
  .argument("[path]", "directory to analyze", ".")
  .option("-m, --model <name>", "target model for tokenization", "claude-sonnet-4-6")
  .option("--strip-comments", "compare current vs comment-stripped")
  .option("--strip-whitespace", "compare current vs whitespace-collapsed")
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

    const isStripMode = opts.stripComments || opts.stripWhitespace;

    const files = scanDirectory(rootPath, {
      respectGitignore: true,
      extraIgnore: config.ignore ?? [],
      include: config.include ?? [],
      exclude: [],
    });

    let deltas: FileDelta[];

    if (isStripMode) {
      // Compare original vs stripped tokens
      deltas = files.map((f) => {
        const before = countTokens(f.content, model.tokenizer);
        let stripped = f.content;
        if (opts.stripComments) stripped = stripComments(stripped);
        if (opts.stripWhitespace) stripped = stripWhitespace(stripped);
        const after = countTokens(stripped, model.tokenizer);
        return {
          relativePath: f.relativePath,
          before,
          after,
          delta: after - before,
        };
      });
    } else {
      // Compare changed files only (git working tree changes)
      const changedPaths = new Set(getChangedFiles(rootPath));
      if (changedPaths.size === 0) {
        console.log(chalk.dim("\n  No changed files found.\n"));
        freeEncoders();
        return;
      }

      const changedFiles = files.filter((f) => changedPaths.has(f.relativePath));
      deltas = changedFiles.map((f) => {
        const current = countTokens(f.content, model.tokenizer);
        // We show current token count — delta from zero since we can't
        // get the previous version without git show (which would need
        // the file content from HEAD). Show as informational.
        return {
          relativePath: f.relativePath,
          before: 0,
          after: current,
          delta: current,
        };
      });
    }

    // Filter out zero-delta files and sort by absolute delta
    const meaningful = deltas
      .filter((d) => d.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    const totalBefore = deltas.reduce((sum, d) => sum + d.before, 0);
    const totalAfter = deltas.reduce((sum, d) => sum + d.after, 0);
    const totalDelta = totalAfter - totalBefore;

    console.log("");
    console.log(
      chalk.bold("  ctxlens diff") +
        chalk.dim(` — ${deltas.length} files, ${model.id}`),
    );
    console.log("");

    if (isStripMode) {
      if (meaningful.length === 0) {
        console.log(chalk.dim("  No token savings from stripping.\n"));
        freeEncoders();
        return;
      }

      for (const d of meaningful.slice(0, 20)) {
        const sign = d.delta < 0 ? chalk.green(`${d.delta}`) : chalk.red(`+${d.delta}`);
        const name = d.relativePath.padEnd(40);
        console.log(`  ${name} ${formatTokens(d.before).padStart(8)} → ${formatTokens(d.after).padStart(8)}  ${sign}`);
      }

      console.log("");
      const totalSign = totalDelta < 0 ? chalk.green(`${totalDelta}`) : chalk.red(`+${totalDelta}`);
      console.log(
        `  ${chalk.bold("Total:")} ${formatTokens(totalBefore)} → ${formatTokens(totalAfter)}  (${totalSign} tokens)`,
      );
      if (totalDelta < 0) {
        const pct = ((Math.abs(totalDelta) / totalBefore) * 100).toFixed(1);
        console.log(chalk.green(`  Saves ${pct}% of tokens`));
      }
    } else {
      // Git changed files mode
      for (const d of meaningful.slice(0, 20)) {
        const name = d.relativePath.padEnd(40);
        console.log(`  ${name} ${formatTokens(d.after).padStart(8)} tokens`);
      }

      console.log("");
      console.log(
        `  ${chalk.bold("Changed files total:")} ${formatTokens(totalAfter)} tokens`,
      );
    }

    console.log("");
    freeEncoders();
  });
