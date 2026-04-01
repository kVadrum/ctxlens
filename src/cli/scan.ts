/**
 * `ctxlens scan` command.
 *
 * The core command — scans a directory, tokenizes every file, and reports
 * token counts with a budget analysis against a target model. Supports
 * terminal (default), JSON, and quiet output modes.
 */

import { resolve, basename } from "node:path";
import { Command } from "commander";
import { scanDirectory } from "../core/scanner.js";
import { countTokens, freeEncoders } from "../core/tokenizer.js";
import { getModel, getAllModels } from "../core/models.js";
import { computeBudget, checkMultiModelBudget } from "../core/budget.js";
import type { FileTokenInfo } from "../core/budget.js";
import { renderTerminal } from "../output/terminal.js";
import { renderJson } from "../output/json.js";

export const scanCommand = new Command("scan")
  .description("Scan a directory and report token counts")
  .argument("[path]", "directory to scan", ".")
  .option("-m, --model <name>", "target model for budget calculation", "claude-sonnet-4-6")
  .option("-d, --depth <n>", "directory tree depth for summary", "3")
  .option("-s, --sort <key>", "sort by: tokens, files, name", "tokens")
  .option("-t, --top <n>", "show top N files/dirs", "10")
  .option("--ignore <patterns...>", "additional ignore patterns")
  .option("--no-gitignore", "don't respect .gitignore")
  .option("--json", "output JSON instead of terminal display")
  .option("--include <patterns...>", "only include matching files")
  .option("--exclude <patterns...>", "exclude matching files")
  .option("-q, --quiet", "minimal output: just total tokens and budget status")
  .action(async (path: string, opts) => {
    const rootPath = resolve(path);
    const model = getModel(opts.model);

    if (!model) {
      console.error(`Unknown model: ${opts.model}. Run 'ctxlens models' to see available models.`);
      process.exit(1);
    }

    // Discover files
    const files = scanDirectory(rootPath, {
      respectGitignore: opts.gitignore !== false,
      extraIgnore: opts.ignore ?? [],
      include: opts.include ?? [],
      exclude: opts.exclude ?? [],
    });

    // Tokenize each file
    const fileTokens: FileTokenInfo[] = files.map((f) => ({
      relativePath: f.relativePath,
      tokens: countTokens(f.content, model.tokenizer),
      lines: f.lines,
    }));

    const depth = parseInt(opts.depth, 10);
    const topN = parseInt(opts.top, 10);
    const result = computeBudget(fileTokens, model, depth);

    // Render output in the requested format
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
      console.log(`${totalFormatted} tokens (${pct}% of ${model.id}) — ${result.status}`);
    } else {
      const allModels = getAllModels();
      const multiModel = checkMultiModelBudget(result.totalTokens, allModels);
      console.log(renderTerminal(result, topN, multiModel));
    }

    freeEncoders();
  });
