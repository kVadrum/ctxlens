/**
 * `ctxlens scan` command.
 *
 * The core command — scans a directory, tokenizes every file, and reports
 * token counts with a budget analysis against a target model. Supports
 * terminal (default), JSON, and quiet output modes.
 */

import { resolve, basename, join } from "node:path";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Command } from "commander";
import { scanDirectory } from "../core/scanner.js";
import { countTokens, freeEncoders } from "../core/tokenizer.js";
import { getModel, getAllModels, registerCustomModels } from "../core/models.js";
import { computeBudget, checkMultiModelBudget } from "../core/budget.js";
import type { FileTokenInfo } from "../core/budget.js";
import { renderTerminal, renderCompare } from "../output/terminal.js";
import type { CompareEntry, SortKey } from "../output/terminal.js";
import { renderJson } from "../output/json.js";
import { renderHtml } from "../output/html.js";
import type { HtmlCompareEntry } from "../output/html.js";
import { loadConfig } from "../utils/config.js";
import { stripComments, stripWhitespace } from "../core/stripper.js";
import { formatTokens, formatCost } from "../utils/format.js";

/** The available tokenizer encodings to compare. */
const COMPARE_ENCODINGS = ["cl100k_base", "o200k_base"];

export const scanCommand = new Command("scan")
  .description("Scan a directory and report token counts")
  .argument("[path]", "directory to scan", ".")
  .option("-m, --model <name>", "target model for budget calculation", "claude-sonnet-4-6")
  .option("-d, --depth <n>", "directory tree depth for summary", "3")
  .option("-s, --sort <key>", "sort by: tokens, files, name", "tokens")
  .option("-t, --top <n>", "show top N files/dirs (0 = all)", "10")
  .option("--ignore <patterns...>", "additional ignore patterns")
  .option("--no-gitignore", "don't respect .gitignore")
  .option("--json", "output JSON instead of terminal display")
  .option("--include <patterns...>", "only include matching files")
  .option("--exclude <patterns...>", "exclude matching files")
  .option("-q, --quiet", "minimal output: just total tokens and budget status")
  .option("--compare", "compare token counts across different tokenizers")
  .option("--report", "generate an HTML report and open in browser")
  .option("--strip-comments", "strip comments before tokenizing")
  .option("--strip-whitespace", "collapse excess whitespace before tokenizing")
  .option("--ci [threshold]", "exit non-zero if utilization exceeds threshold (default: 100%)")
  .option("--cost", "show estimated API input cost for the target model")
  .option("-o, --output <file>", "write output to a file instead of stdout")
  .action(async (path: string, opts) => {
    const rootPath = resolve(path);
    const config = loadConfig(rootPath);
    registerCustomModels(config);

    // Resolve model: CLI flag > env var > config > default
    const modelId =
      opts.model !== "claude-sonnet-4-6"
        ? opts.model
        : process.env.CTXLENS_MODEL ?? config.defaultModel ?? "claude-sonnet-4-6";
    const model = getModel(modelId);

    if (!model) {
      console.error(`Unknown model: ${modelId}. Run 'ctxlens models' to see available models.`);
      process.exit(1);
    }

    // Merge config with CLI options (CLI wins)
    const extraIgnore = [...(config.ignore ?? []), ...(opts.ignore ?? [])];
    const include = opts.include ?? config.include ?? [];
    const exclude = [...(config.exclude ?? []), ...(opts.exclude ?? [])];

    // Discover files
    const showProgress = !opts.json && !opts.quiet && !opts.ci && !opts.output;
    const files = scanDirectory(rootPath, {
      respectGitignore: opts.gitignore !== false,
      extraIgnore,
      include,
      exclude,
      onProgress: showProgress
        ? (count) => process.stdout.write(`\r  Scanning... ${count} files`)
        : undefined,
    });
    if (showProgress && files.length >= 100) {
      process.stdout.write(`\r  Scanning... ${files.length} files\n`);
    }

    // Tokenize each file (optionally stripping comments/whitespace first)
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

    // Render output in the requested format
    if (opts.compare) {
      const entries: CompareEntry[] = files.map((f) => {
        const tokenCounts: Record<string, number> = {};
        for (const enc of COMPARE_ENCODINGS) {
          tokenCounts[enc] = countTokens(f.content, enc);
        }
        return { relativePath: f.relativePath, tokenCounts };
      });
      console.log(renderCompare(entries, COMPARE_ENCODINGS, topN));
      freeEncoders();
      return;
    }

    if (opts.report) {
      const allModels = getAllModels();
      const multiModel = checkMultiModelBudget(result.totalTokens, allModels);
      const compareEntries: HtmlCompareEntry[] = files.map((f) => {
        const tokenCounts: Record<string, number> = {};
        for (const enc of COMPARE_ENCODINGS) {
          tokenCounts[enc] = countTokens(f.content, enc);
        }
        return { relativePath: f.relativePath, tokenCounts };
      });
      const html = renderHtml(result, basename(rootPath), multiModel, {
        entries: compareEntries,
        encodings: COMPARE_ENCODINGS,
      });
      const reportPath = join(rootPath, "ctxlens-report.html");
      writeFileSync(reportPath, html, "utf-8");
      console.log(`Report saved to ${reportPath}`);

      // Try to open in browser
      try {
        const platform = process.platform;
        if (platform === "darwin") {
          execFileSync("open", [reportPath]);
        } else if (platform === "win32") {
          execFileSync("cmd", ["/c", "start", reportPath]);
        } else {
          // Linux / WSL
          try {
            execFileSync("xdg-open", [reportPath], { stdio: "ignore" });
          } catch {
            // WSL fallback
            try {
              execFileSync("wslview", [reportPath], { stdio: "ignore" });
            } catch {
              console.log("Open the file in your browser to view the report.");
            }
          }
        }
      } catch {
        console.log("Open the file in your browser to view the report.");
      }

      freeEncoders();
      return;
    }

    function emit(text: string): void {
      if (opts.output) {
        try {
          writeFileSync(resolve(opts.output), text, "utf-8");
          console.log(`Output written to ${opts.output}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Failed to write to ${opts.output}: ${msg}`);
          process.exit(1);
        }
      } else {
        console.log(text);
      }
    }

    if (opts.ci) {
      // CI mode: output JSON for machine consumption, exit 1 if over threshold
      const ciThreshold = opts.ci === true ? 100 : parseInt(opts.ci, 10);
      const pct = result.utilization * 100;
      emit(renderJson(result, basename(rootPath), opts.cost));
      freeEncoders();
      if (pct > ciThreshold) {
        console.error(`Budget exceeded: ${pct.toFixed(1)}% > ${ciThreshold}% threshold`);
        process.exit(1);
      }
      return;
    }

    if (opts.cost && !model.inputPrice) {
      console.error(`Note: no pricing data for ${model.id} — cost estimate unavailable.`);
    }

    if (opts.json) {
      emit(renderJson(result, basename(rootPath), opts.cost));
    } else if (opts.quiet) {
      const pct = (result.utilization * 100).toFixed(1);
      let line = `${formatTokens(result.totalTokens)} tokens (${pct}% of ${model.id}) — ${result.status}`;
      if (opts.cost && model.inputPrice) {
        line += ` — ${formatCost(result.totalTokens, model.inputPrice)} input cost`;
      }
      emit(line);
    } else {
      const allModels = getAllModels();
      const multiModel = checkMultiModelBudget(result.totalTokens, allModels);
      emit(renderTerminal(result, topN, multiModel, opts.sort as SortKey, opts.cost));
    }

    freeEncoders();
  });
