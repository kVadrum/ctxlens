/**
 * `ctxlens budget` command.
 *
 * Simulates context strategies — "if I give the AI only these files,
 * how much budget do I use?" Supports built-in strategies (all, changed,
 * staged) and custom glob patterns.
 */

import { resolve, basename } from "node:path";
import { Command } from "commander";
import { scanDirectory } from "../core/scanner.js";
import { countTokens, freeEncoders } from "../core/tokenizer.js";
import { getModel, getAllModels } from "../core/models.js";
import { computeBudget, checkMultiModelBudget } from "../core/budget.js";
import type { FileTokenInfo } from "../core/budget.js";
import { getChangedFiles, getStagedFiles } from "../core/git.js";
import { renderTerminal } from "../output/terminal.js";
import { renderJson } from "../output/json.js";
import { loadConfig } from "../utils/config.js";
import { stripComments, stripWhitespace } from "../core/stripper.js";

export const budgetCommand = new Command("budget")
  .description("Simulate context strategies against a model budget")
  .argument("[path]", "directory to analyze", ".")
  .option("-m, --model <name>", "target model for budget calculation", "claude-sonnet-4-6")
  .option(
    "-s, --strategy <strategy>",
    "strategy: all, changed, staged, or glob patterns (comma-separated)",
    "all",
  )
  .option("-d, --depth <n>", "directory tree depth for summary", "3")
  .option("-t, --top <n>", "show top N files/dirs", "10")
  .option("--json", "output JSON instead of terminal display")
  .option("-q, --quiet", "minimal output: just total tokens and budget status")
  .option("--strip-comments", "strip comments before tokenizing")
  .option("--strip-whitespace", "collapse excess whitespace before tokenizing")
  .action(async (path: string, opts) => {
    const rootPath = resolve(path);
    const config = loadConfig(rootPath);

    const modelId =
      opts.model !== "claude-sonnet-4-6"
        ? opts.model
        : process.env.CTXLENS_MODEL ?? config.defaultModel ?? "claude-sonnet-4-6";
    const model = getModel(modelId);

    if (!model) {
      console.error(`Unknown model: ${modelId}. Run 'ctxlens models' to see available models.`);
      process.exit(1);
    }

    // Determine which files to include based on strategy
    let strategyFilter: Set<string> | null = null;
    const strategy = opts.strategy as string;

    if (strategy === "changed") {
      const changed = getChangedFiles(rootPath);
      if (changed.length === 0) {
        console.log("No changed files found.");
        return;
      }
      strategyFilter = new Set(changed);
    } else if (strategy === "staged") {
      const staged = getStagedFiles(rootPath);
      if (staged.length === 0) {
        console.log("No staged files found.");
        return;
      }
      strategyFilter = new Set(staged);
    } else if (strategy !== "all") {
      // Treat as comma-separated glob patterns — scan with include filter
      const patterns = strategy.split(",").map((s: string) => s.trim());
      const files = scanDirectory(rootPath, {
        respectGitignore: true,
        extraIgnore: config.ignore ?? [],
        include: patterns,
        exclude: [],
      });

      const fileTokens: FileTokenInfo[] = files.map((f) => {
        let content = f.content;
        if (opts.stripComments) content = stripComments(content);
        if (opts.stripWhitespace) content = stripWhitespace(content);
        return {
          relativePath: f.relativePath,
          tokens: countTokens(content, model.tokenizer),
          lines: f.lines,
        };
      });

      const depth = parseInt(opts.depth, 10);
      const topN = parseInt(opts.top, 10);
      const result = computeBudget(fileTokens, model, depth);

      renderOutput(result, rootPath, opts, topN);
      freeEncoders();
      return;
    }

    // Scan all files, then filter by strategy
    const allFiles = scanDirectory(rootPath, {
      respectGitignore: true,
      extraIgnore: config.ignore ?? [],
      include: [],
      exclude: [],
    });

    const files = strategyFilter
      ? allFiles.filter((f) => strategyFilter!.has(f.relativePath))
      : allFiles;

    const fileTokens: FileTokenInfo[] = files.map((f) => {
      let content = f.content;
      if (opts.stripComments) content = stripComments(content);
      if (opts.stripWhitespace) content = stripWhitespace(content);
      return {
        relativePath: f.relativePath,
        tokens: countTokens(content, model.tokenizer),
        lines: f.lines,
      };
    });

    const depth = parseInt(opts.depth, 10);
    const topN = parseInt(opts.top, 10);
    const result = computeBudget(fileTokens, model, depth);

    renderOutput(result, rootPath, opts, topN);
    freeEncoders();
  });

function renderOutput(
  result: ReturnType<typeof computeBudget>,
  rootPath: string,
  opts: { json?: boolean; quiet?: boolean; model: string },
  topN: number,
): void {
  if (opts.json) {
    console.log(renderJson(result, basename(rootPath)));
  } else if (opts.quiet) {
    const totalFormatted =
      result.totalTokens >= 1_000_000
        ? `${(result.totalTokens / 1_000_000).toFixed(1)}M`
        : result.totalTokens >= 1_000
          ? `${(result.totalTokens / 1_000).toFixed(1)}k`
          : String(result.totalTokens);
    const pct = (result.utilization * 100).toFixed(1);
    console.log(`${totalFormatted} tokens (${pct}% of ${result.model.id}) — ${result.status}`);
  } else {
    const allModels = getAllModels();
    const multiModel = checkMultiModelBudget(result.totalTokens, allModels);
    console.log(renderTerminal(result, topN, multiModel));
  }
}
