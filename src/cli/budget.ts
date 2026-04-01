/**
 * `ctxlens budget` command.
 *
 * Simulates context strategies — "if I give the AI only these files,
 * how much budget do I use?" Supports built-in strategies (all, changed,
 * staged) and custom glob patterns.
 */

import { resolve, basename } from "node:path";
import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { scanDirectory } from "../core/scanner.js";
import { countTokens, freeEncoders } from "../core/tokenizer.js";
import { getModel, getAllModels, registerCustomModels } from "../core/models.js";
import { computeBudget, checkMultiModelBudget } from "../core/budget.js";
import type { FileTokenInfo } from "../core/budget.js";
import { getChangedFiles, getStagedFiles } from "../core/git.js";
import { renderTerminal } from "../output/terminal.js";
import { renderJson } from "../output/json.js";
import { loadConfig } from "../utils/config.js";
import { stripComments, stripWhitespace } from "../core/stripper.js";
import { formatTokens } from "../utils/format.js";

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
  .option("-o, --output <file>", "write output to a file instead of stdout")
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

      const depth = parseInt(opts.depth !== "3" ? opts.depth : String(config.depth ?? 3), 10);
      const topN = parseInt(opts.top !== "10" ? opts.top : String(config.top ?? 10), 10);
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

    const depth = parseInt(opts.depth !== "3" ? opts.depth : String(config.depth ?? 3), 10);
    const topN = parseInt(opts.top !== "10" ? opts.top : String(config.top ?? 10), 10);
    const result = computeBudget(fileTokens, model, depth);

    renderOutput(result, rootPath, opts, topN);
    freeEncoders();
  });

function renderOutput(
  result: ReturnType<typeof computeBudget>,
  rootPath: string,
  opts: { json?: boolean; quiet?: boolean; model: string; output?: string },
  topN: number,
): void {
  function emit(text: string): void {
    if (opts.output) {
      writeFileSync(resolve(opts.output), text, "utf-8");
      console.log(`Output written to ${opts.output}`);
    } else {
      console.log(text);
    }
  }

  if (opts.json) {
    emit(renderJson(result, basename(rootPath)));
  } else if (opts.quiet) {
    const pct = (result.utilization * 100).toFixed(1);
    emit(`${formatTokens(result.totalTokens)} tokens (${pct}% of ${result.model.id}) — ${result.status}`);
  } else {
    const allModels = getAllModels();
    const multiModel = checkMultiModelBudget(result.totalTokens, allModels);
    emit(renderTerminal(result, topN, multiModel));
  }
}
