import { describe, it, expect } from "vitest";
import { computeBudget, checkMultiModelBudget } from "../src/core/budget.js";
import type { FileTokenInfo } from "../src/core/budget.js";
import type { ModelInfo } from "../src/core/models.js";

const mockModel: ModelInfo = {
  id: "test-model",
  name: "Test Model",
  provider: "Test",
  contextWindow: 10000,
  tokenizer: "cl100k_base",
};

const sampleFiles: FileTokenInfo[] = [
  { relativePath: "src/core/budget.ts", tokens: 500, lines: 50 },
  { relativePath: "src/core/scanner.ts", tokens: 800, lines: 80 },
  { relativePath: "src/cli/index.ts", tokens: 200, lines: 20 },
  { relativePath: "README.md", tokens: 300, lines: 30 },
];

describe("computeBudget", () => {
  it("computes total tokens", () => {
    const result = computeBudget(sampleFiles, mockModel, 3);
    expect(result.totalTokens).toBe(1800);
  });

  it("computes utilization ratio", () => {
    const result = computeBudget(sampleFiles, mockModel, 3);
    expect(result.utilization).toBeCloseTo(0.18);
  });

  it("reports correct file count", () => {
    const result = computeBudget(sampleFiles, mockModel, 3);
    expect(result.totalFiles).toBe(4);
  });

  it("sorts files by token count descending", () => {
    const result = computeBudget(sampleFiles, mockModel, 3);
    expect(result.files[0].relativePath).toBe("src/core/scanner.ts");
    expect(result.files[1].relativePath).toBe("src/core/budget.ts");
  });

  it("aggregates directories at specified depth", () => {
    const result = computeBudget(sampleFiles, mockModel, 2);
    const dirPaths = result.directories.map((d) => d.path);
    expect(dirPaths).toContain("src/core/");
    expect(dirPaths).toContain("src/cli/");
    expect(dirPaths).toContain("(root files)");
  });

  it("labels root-level files as (root files)", () => {
    const result = computeBudget(sampleFiles, mockModel, 3);
    const rootDir = result.directories.find((d) => d.path === "(root files)");
    expect(rootDir).toBeDefined();
    expect(rootDir!.tokens).toBe(300);
    expect(rootDir!.files).toBe(1);
  });

  it("returns 'fits' when utilization <= 80%", () => {
    const result = computeBudget(sampleFiles, mockModel, 3);
    expect(result.status).toBe("fits");
  });

  it("returns 'tight' when utilization 80-100%", () => {
    const tightModel = { ...mockModel, contextWindow: 2000 };
    const result = computeBudget(sampleFiles, tightModel, 3);
    expect(result.status).toBe("tight");
  });

  it("returns 'exceeds' when utilization > 100%", () => {
    const smallModel = { ...mockModel, contextWindow: 1000 };
    const result = computeBudget(sampleFiles, smallModel, 3);
    expect(result.status).toBe("exceeds");
  });

  it("handles empty file list", () => {
    const result = computeBudget([], mockModel, 3);
    expect(result.totalTokens).toBe(0);
    expect(result.totalFiles).toBe(0);
    expect(result.utilization).toBe(0);
    expect(result.status).toBe("fits");
  });
});

describe("checkMultiModelBudget", () => {
  it("checks token count against multiple models", () => {
    const models: ModelInfo[] = [
      { ...mockModel, id: "small", contextWindow: 1000 },
      { ...mockModel, id: "medium", contextWindow: 5000 },
      { ...mockModel, id: "large", contextWindow: 200000 },
    ];
    const results = checkMultiModelBudget(2000, models);

    expect(results[0].status).toBe("exceeds");
    expect(results[1].status).toBe("fits");
    expect(results[2].status).toBe("fits");
  });

  it("returns utilization ratios", () => {
    const models = [{ ...mockModel, contextWindow: 10000 }];
    const results = checkMultiModelBudget(5000, models);
    expect(results[0].utilization).toBeCloseTo(0.5);
  });
});
