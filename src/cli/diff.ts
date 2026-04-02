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
import { getChangedFiles, getFilesAtRef, getFileContentAtRef } from "../core/git.js";

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
  .option("--include <patterns...>", "only include matching files")
  .option("--exclude <patterns...>", "exclude matching files")
  .option("--strip-comments", "compare current vs comment-stripped")
  .option("--strip-whitespace", "compare current vs whitespace-collapsed")
  .option("--ref <ref>", "compare current tokens to a git ref (e.g. HEAD~1, main)")
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
    const isRefMode = !!opts.ref;

    if (isStripMode && isRefMode) {
      console.error("Cannot combine --ref with --strip-comments / --strip-whitespace.");
      process.exit(1);
    }

    const files = scanDirectory(rootPath, {
      respectGitignore: true,
      extraIgnore: config.ignore ?? [],
      include: opts.include ?? config.include ?? [],
      exclude: [...(config.exclude ?? []), ...(opts.exclude ?? [])],
    });

    let deltas: FileDelta[];
    let modeLabel = "";

    if (isStripMode) {
      modeLabel = "stripping";
      deltas = files.map((f) => {
        const before = countTokens(f.content, model.tokenizer);
        let stripped = f.content;
        if (opts.stripComments) stripped = stripComments(stripped);
        if (opts.stripWhitespace) stripped = stripWhitespace(stripped);
        const after = countTokens(stripped, model.tokenizer);
        return { relativePath: f.relativePath, before, after, delta: after - before };
      });
    } else if (isRefMode) {
      modeLabel = `vs ${opts.ref}`;
      // Build a map of current file tokens
      const currentMap = new Map<string, number>();
      for (const f of files) {
        currentMap.set(f.relativePath, countTokens(f.content, model.tokenizer));
      }

      // Get files at the ref (throws on invalid ref)
      let refFiles: string[];
      try {
        refFiles = getFilesAtRef(rootPath, opts.ref);
      } catch {
        console.error(`Invalid git ref: '${opts.ref}'. Check that the branch, tag, or commit exists.`);
        freeEncoders();
        process.exit(1);
      }

      const refFileSet = new Set(refFiles);
      const allPaths = new Set([...currentMap.keys(), ...refFiles]);
      const unreadable: string[] = [];

      deltas = [];
      for (const p of allPaths) {
        const after = currentMap.get(p) ?? 0;
        let before = 0;
        if (refFileSet.has(p)) {
          const content = getFileContentAtRef(rootPath, opts.ref, p);
          if (content !== null) {
            before = countTokens(content, model.tokenizer);
          } else {
            unreadable.push(p);
          }
        }
        if (before !== after) {
          deltas.push({ relativePath: p, before, after, delta: after - before });
        }
      }

      if (unreadable.length > 0) {
        console.error(chalk.yellow(`  Warning: could not read ${unreadable.length} file(s) at ${opts.ref}`));
      }
    } else {
      modeLabel = "changed files";
      const changedPaths = new Set(getChangedFiles(rootPath));
      if (changedPaths.size === 0) {
        console.log(chalk.dim("\n  No changed files found.\n"));
        freeEncoders();
        return;
      }

      const changedFiles = files.filter((f) => changedPaths.has(f.relativePath));
      deltas = changedFiles.map((f) => {
        const current = countTokens(f.content, model.tokenizer);
        return { relativePath: f.relativePath, before: 0, after: current, delta: current };
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
        chalk.dim(` — ${modeLabel}, ${deltas.length} files, ${model.id}`),
    );
    console.log("");

    if (isStripMode || isRefMode) {
      if (meaningful.length === 0) {
        const msg = isRefMode
          ? `No token differences vs ${opts.ref}.`
          : "No token savings from stripping.";
        console.log(chalk.dim(`\n  ${msg}\n`));
        freeEncoders();
        return;
      }

      for (const d of meaningful.slice(0, 20)) {
        const sign = d.delta < 0 ? chalk.green(`${d.delta}`) : chalk.red(`+${d.delta}`);
        const arrow = d.delta < 0 ? chalk.green("→") : chalk.red("→");
        const name = d.relativePath.padEnd(40);
        console.log(`  ${name} ${formatTokens(d.before).padStart(8)} ${arrow} ${formatTokens(d.after).padStart(8)}  ${sign}`);
      }

      if (meaningful.length > 20) {
        console.log(chalk.dim(`  ... and ${meaningful.length - 20} more files`));
      }

      console.log("");
      const totalSign = totalDelta < 0 ? chalk.green(`${totalDelta}`) : chalk.red(`+${totalDelta}`);
      const totalArrow = totalDelta < 0 ? chalk.green("→") : chalk.red("→");
      console.log(
        `  ${chalk.bold("Total:")} ${formatTokens(totalBefore)} ${totalArrow} ${formatTokens(totalAfter)}  (${totalSign} tokens)`,
      );
      if (totalDelta < 0) {
        const pct = ((Math.abs(totalDelta) / totalBefore) * 100).toFixed(1);
        console.log(chalk.green.bold(`  ✓ Saves ${pct}% of tokens`));
      }
    } else {
      // Git changed files mode
      for (const d of meaningful.slice(0, 20)) {
        const name = d.relativePath.padEnd(40);
        console.log(`  ${chalk.yellow("~")} ${name} ${chalk.bold(formatTokens(d.after).padStart(8))} tokens`);
      }

      if (meaningful.length > 20) {
        console.log(chalk.dim(`  ... and ${meaningful.length - 20} more files`));
      }

      console.log("");
      console.log(
        `  ${chalk.bold("Changed files total:")} ${chalk.yellow(formatTokens(totalAfter))} tokens`,
      );
    }

    console.log("");
    freeEncoders();
  });
