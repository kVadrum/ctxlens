/**
 * Budget calculation engine for ctxlens.
 *
 * Takes per-file token counts and a target model, then computes:
 * - Total token usage and context window utilization
 * - Per-directory aggregation (grouped to a configurable depth)
 * - Budget status: fits (<= 80%), tight (80–100%), or exceeds (> 100%)
 * - Multi-model comparison for the budget status section
 */

import type { ModelInfo } from "./models.js";

/** Token count and metadata for a single scanned file. */
export interface FileTokenInfo {
  /** Path relative to the scan root. */
  relativePath: string;
  /** Number of tokens in the file. */
  tokens: number;
  /** Number of lines in the file. */
  lines: number;
}

/** Aggregated token count for a directory. */
export interface DirectoryTokenInfo {
  /** Directory path (relative, with trailing slash). */
  path: string;
  /** Sum of tokens across all files in this directory (up to depth). */
  tokens: number;
  /** Number of files in this directory. */
  files: number;
}

/**
 * How the total token count relates to the model's context window.
 * - `"fits"` — at or below 80% utilization
 * - `"tight"` — between 80% and 100%
 * - `"exceeds"` — over 100%
 */
export type BudgetStatus = "fits" | "tight" | "exceeds";

/** Complete result of a budget analysis against a single model. */
export interface BudgetResult {
  /** The model this budget was computed against. */
  model: ModelInfo;
  /** Total tokens across all scanned files. */
  totalTokens: number;
  /** Number of files included in the scan. */
  totalFiles: number;
  /** Ratio of totalTokens to the model's context window (0.0–N). */
  utilization: number;
  /** Overall budget status for the target model. */
  status: BudgetStatus;
  /** All scanned files sorted by token count (descending). */
  files: FileTokenInfo[];
  /** Directory-level aggregation sorted by token count (descending). */
  directories: DirectoryTokenInfo[];
}

function computeStatus(utilization: number): BudgetStatus {
  if (utilization <= 0.8) return "fits";
  if (utilization <= 1.0) return "tight";
  return "exceeds";
}

/**
 * Computes a full budget analysis for a set of tokenized files against a model.
 *
 * @param files - Per-file token counts from the scanner + tokenizer.
 * @param model - Target model to calculate budget against.
 * @param depth - How many directory levels deep to aggregate (e.g. 3 → "src/core/utils/").
 * @returns A {@link BudgetResult} with sorted files, directories, and status.
 */
export function computeBudget(
  files: FileTokenInfo[],
  model: ModelInfo,
  depth: number,
): BudgetResult {
  const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);
  const utilization = totalTokens / model.contextWindow;

  // Aggregate tokens per directory up to the specified depth
  const dirMap = new Map<string, { tokens: number; files: number }>();
  for (const file of files) {
    const parts = file.relativePath.split("/");
    const dirParts = parts.slice(0, Math.min(parts.length - 1, depth));
    const dirPath = dirParts.length > 0 ? dirParts.join("/") + "/" : "./";

    const existing = dirMap.get(dirPath) ?? { tokens: 0, files: 0 };
    existing.tokens += file.tokens;
    existing.files += 1;
    dirMap.set(dirPath, existing);
  }

  const directories: DirectoryTokenInfo[] = Array.from(dirMap.entries())
    .map(([path, info]) => ({ path, ...info }))
    .sort((a, b) => b.tokens - a.tokens);

  return {
    model,
    totalTokens,
    totalFiles: files.length,
    utilization,
    status: computeStatus(utilization),
    files: [...files].sort((a, b) => b.tokens - a.tokens),
    directories,
  };
}

/**
 * Checks a single token total against multiple models at once.
 * Used to render the "Budget status" section showing which models
 * the codebase fits in, which are tight, and which it exceeds.
 *
 * @param totalTokens - Total token count from the scan.
 * @param models      - Array of models to check against.
 * @returns Per-model utilization and status, in the same order as input.
 */
export function checkMultiModelBudget(
  totalTokens: number,
  models: ModelInfo[],
): Array<{ model: ModelInfo; utilization: number; status: BudgetStatus }> {
  return models.map((model) => {
    const utilization = totalTokens / model.contextWindow;
    return { model, utilization, status: computeStatus(utilization) };
  });
}
