/**
 * JSON output renderer for ctxlens.
 *
 * Produces machine-readable output for CI pipelines, scripting, and piping
 * to other tools. Activated via `ctxlens scan --json`.
 */

import type { BudgetResult } from "../core/budget.js";
import { VERSION } from "../utils/version.js";

/**
 * Renders a budget result as a formatted JSON string.
 *
 * @param result         - The budget analysis result to serialize.
 * @param repositoryName - Name of the scanned repository (used as a label).
 * @returns Pretty-printed JSON string.
 */
export function renderJson(result: BudgetResult, repositoryName: string): string {
  return JSON.stringify(
    {
      version: VERSION,
      repository: repositoryName,
      scannedAt: new Date().toISOString(),
      totalFiles: result.totalFiles,
      totalTokens: result.totalTokens,
      model: result.model.id,
      contextWindow: result.model.contextWindow,
      utilization: Math.round(result.utilization * 1000) / 1000,
      status: result.status,
      directories: result.directories.map((d) => ({
        path: d.path,
        tokens: d.tokens,
        files: d.files,
      })),
      files: result.files.map((f) => ({
        path: f.relativePath,
        tokens: f.tokens,
        lines: f.lines,
      })),
    },
    null,
    2,
  );
}
