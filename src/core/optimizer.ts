/**
 * Optimization analyzer for ctxlens.
 *
 * Examines tokenized files and produces actionable recommendations
 * for reducing token consumption. Categories of suggestions:
 * - Oversized files that dominate the budget
 * - Comment-heavy files where comments are a large share of tokens
 * - Test files that may not need to be in AI context
 * - Type-dense files that are efficient for AI context inclusion
 */

import type { FileTokenInfo } from "./budget.js";

export type SuggestionSeverity = "info" | "warning" | "optimization";

export interface Suggestion {
  severity: SuggestionSeverity;
  file: string;
  tokens: number;
  message: string;
  detail: string;
}

/** Thresholds for optimization suggestions. */
const OVERSIZED_MIN_TOKENS = 2000; // Only flag files with substantial token count
const COMMENT_RATIO_THRESHOLD = 0.4; // 40%+ comment tokens = flag
const TEST_DIR_PATTERNS = ["test", "tests", "__tests__", "spec", "specs", "__spec__"];

/**
 * Estimates what fraction of a file's content is comments.
 * Uses a simple line-based heuristic — not a real parser, but good enough
 * for recommendations.
 */
function estimateCommentRatio(content: string): number {
  const lines = content.split("\n");
  let commentLines = 0;
  let inBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    if (inBlock) {
      commentLines++;
      if (trimmed.includes("*/")) inBlock = false;
      continue;
    }

    if (trimmed.startsWith("/*")) {
      commentLines++;
      if (!trimmed.includes("*/")) inBlock = true;
      continue;
    }

    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("\"\"\"") ||
      trimmed.startsWith("'''")
    ) {
      commentLines++;
    }
  }

  const nonEmptyLines = lines.filter((l) => l.trim().length > 0).length;
  return nonEmptyLines > 0 ? commentLines / nonEmptyLines : 0;
}

function isTestFile(path: string): boolean {
  const lower = path.toLowerCase();
  const parts = lower.split("/");

  // Check if any directory in the path is a test directory
  for (const part of parts) {
    if (TEST_DIR_PATTERNS.includes(part)) return true;
  }

  // Check filename patterns
  const filename = parts[parts.length - 1];
  return (
    filename.includes(".test.") ||
    filename.includes(".spec.") ||
    filename.includes("_test.") ||
    filename.includes("_spec.") ||
    filename.startsWith("test_")
  );
}

function isTypeFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes("/types/") ||
    lower.includes("/interfaces/") ||
    lower.endsWith(".d.ts") ||
    lower.endsWith("types.ts") ||
    lower.endsWith("interfaces.ts")
  );
}

/**
 * Analyzes tokenized files and returns optimization suggestions.
 *
 * @param files      - Per-file token counts and content.
 * @param contents   - Map of relative path to file content (for comment analysis).
 * @param totalTokens - Total token count across all files.
 */
export function analyze(
  files: FileTokenInfo[],
  contents: Map<string, string>,
  totalTokens: number,
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Sort by tokens descending
  const sorted = [...files].sort((a, b) => b.tokens - a.tokens);

  // Track test file totals
  let testTokens = 0;
  let testFileCount = 0;

  for (const file of sorted) {
    const pct = file.tokens / totalTokens;
    const pctStr = (pct * 100).toFixed(1);
    const content = contents.get(file.relativePath);

    // Oversized files — must be both large in absolute terms AND disproportionate
    // In a repo with N files, a file taking >2x its "fair share" is notable
    const fairShare = 1 / files.length;
    if (file.tokens >= OVERSIZED_MIN_TOKENS && pct >= fairShare * 3) {
      suggestions.push({
        severity: "warning",
        file: file.relativePath,
        tokens: file.tokens,
        message: `This file is ${pctStr}% of your total budget`,
        detail: "Consider splitting into smaller modules if it contains distinct responsibilities.",
      });
    }

    // Comment-heavy files
    if (content) {
      const commentRatio = estimateCommentRatio(content);
      if (commentRatio >= COMMENT_RATIO_THRESHOLD && file.tokens > 200) {
        const commentPct = (commentRatio * 100).toFixed(0);
        suggestions.push({
          severity: "optimization",
          file: file.relativePath,
          tokens: file.tokens,
          message: `~${commentPct}% of this file is comments`,
          detail:
            "Strip comments for AI context with: ctxlens budget --strip-comments",
        });
      }
    }

    // Track test files
    if (isTestFile(file.relativePath)) {
      testTokens += file.tokens;
      testFileCount++;
    }

    // Type-dense files (positive signal)
    if (isTypeFile(file.relativePath) && file.tokens > 0) {
      suggestions.push({
        severity: "info",
        file: file.relativePath,
        tokens: file.tokens,
        message: "Type-dense, token-light — ideal for AI context",
        detail: "Type definitions give AI models high signal per token.",
      });
    }
  }

  // Test file summary
  if (testFileCount > 0) {
    const testPct = ((testTokens / totalTokens) * 100).toFixed(1);
    suggestions.push({
      severity: "optimization",
      file: `${testFileCount} test files`,
      tokens: testTokens,
      message: `Test files are ${testPct}% of total tokens`,
      detail:
        "Most AI tools don't need test context unless debugging tests. Exclude with: --exclude 'tests/**'",
    });
  }

  return suggestions;
}
