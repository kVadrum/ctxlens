import type { ModelInfo } from "./models.js";

export interface FileTokenInfo {
  relativePath: string;
  tokens: number;
  lines: number;
}

export interface DirectoryTokenInfo {
  path: string;
  tokens: number;
  files: number;
}

export type BudgetStatus = "fits" | "tight" | "exceeds";

export interface BudgetResult {
  model: ModelInfo;
  totalTokens: number;
  totalFiles: number;
  utilization: number;
  status: BudgetStatus;
  files: FileTokenInfo[];
  directories: DirectoryTokenInfo[];
}

function computeStatus(utilization: number): BudgetStatus {
  if (utilization <= 0.8) return "fits";
  if (utilization <= 1.0) return "tight";
  return "exceeds";
}

export function computeBudget(
  files: FileTokenInfo[],
  model: ModelInfo,
  depth: number,
): BudgetResult {
  const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);
  const utilization = totalTokens / model.contextWindow;

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

export function checkMultiModelBudget(
  totalTokens: number,
  models: ModelInfo[],
): Array<{ model: ModelInfo; utilization: number; status: BudgetStatus }> {
  return models.map((model) => {
    const utilization = totalTokens / model.contextWindow;
    return { model, utilization, status: computeStatus(utilization) };
  });
}
