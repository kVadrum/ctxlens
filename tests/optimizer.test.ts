import { describe, it, expect } from "vitest";
import { analyze } from "../src/core/optimizer.js";
import type { FileTokenInfo } from "../src/core/budget.js";

describe("analyze", () => {
  it("flags oversized files above threshold", () => {
    // Need enough files so that one file taking most of the budget exceeds 3x fair share
    // 10 files → fair share = 10%, 3x = 30%. big.ts at 5000/5900 = 84.7% >> 30%
    const files: FileTokenInfo[] = [
      { relativePath: "big.ts", tokens: 5000, lines: 500 },
      ...Array.from({ length: 9 }, (_, i) => ({
        relativePath: `small${i}.ts`,
        tokens: 100,
        lines: 10,
      })),
    ];
    const contents = new Map([
      ["big.ts", "x\n".repeat(500)],
      ...Array.from({ length: 9 }, (_, i) => [`small${i}.ts`, "y\n".repeat(10)] as [string, string]),
    ]);
    const total = 5000 + 9 * 100;
    const suggestions = analyze(files, contents, total);
    const warnings = suggestions.filter((s) => s.severity === "warning");
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].file).toBe("big.ts");
  });

  it("does not flag small files even if disproportionate", () => {
    const files: FileTokenInfo[] = [
      { relativePath: "a.ts", tokens: 500, lines: 50 },
      { relativePath: "b.ts", tokens: 10, lines: 5 },
    ];
    const contents = new Map([
      ["a.ts", "x\n".repeat(50)],
      ["b.ts", "y\n".repeat(5)],
    ]);
    const suggestions = analyze(files, contents, 510);
    const warnings = suggestions.filter((s) => s.severity === "warning");
    expect(warnings).toHaveLength(0);
  });

  it("flags comment-heavy files", () => {
    const commentHeavy = Array(50).fill("// comment").join("\n") + "\n" + Array(10).fill("code").join("\n");
    const files: FileTokenInfo[] = [
      { relativePath: "commented.ts", tokens: 500, lines: 60 },
    ];
    const contents = new Map([["commented.ts", commentHeavy]]);
    const suggestions = analyze(files, contents, 500);
    const opts = suggestions.filter((s) => s.severity === "optimization" && s.file === "commented.ts");
    expect(opts.length).toBeGreaterThan(0);
    expect(opts[0].message).toContain("comments");
    expect(opts[0].message).toContain("save");
  });

  it("identifies test files and reports total", () => {
    const files: FileTokenInfo[] = [
      { relativePath: "src/app.ts", tokens: 1000, lines: 100 },
      { relativePath: "tests/app.test.ts", tokens: 500, lines: 50 },
      { relativePath: "__tests__/helper.ts", tokens: 200, lines: 20 },
    ];
    const contents = new Map<string, string>();
    const suggestions = analyze(files, contents, 1700);
    const testSuggestion = suggestions.find((s) => s.file.includes("test files"));
    expect(testSuggestion).toBeDefined();
    expect(testSuggestion!.tokens).toBe(700);
  });

  it("marks type-dense files as positive signal", () => {
    const files: FileTokenInfo[] = [
      { relativePath: "src/types/index.ts", tokens: 200, lines: 50 },
    ];
    const contents = new Map<string, string>();
    const suggestions = analyze(files, contents, 200);
    const infos = suggestions.filter((s) => s.severity === "info");
    expect(infos.length).toBeGreaterThan(0);
    expect(infos[0].message).toContain("Type-dense");
  });

  it("returns empty suggestions for a lean codebase", () => {
    const files: FileTokenInfo[] = [
      { relativePath: "a.ts", tokens: 100, lines: 10 },
      { relativePath: "b.ts", tokens: 100, lines: 10 },
    ];
    const contents = new Map([
      ["a.ts", "code\n".repeat(10)],
      ["b.ts", "code\n".repeat(10)],
    ]);
    const suggestions = analyze(files, contents, 200);
    expect(suggestions).toHaveLength(0);
  });
});
