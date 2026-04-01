import { describe, it, expect, afterAll } from "vitest";
import { countTokens, freeEncoders } from "../src/core/tokenizer.js";

afterAll(() => {
  freeEncoders();
});

describe("countTokens", () => {
  it("returns a positive count for non-empty text", () => {
    const count = countTokens("Hello, world!");
    expect(count).toBeGreaterThan(0);
  });

  it("returns 0 for empty string", () => {
    expect(countTokens("")).toBe(0);
  });

  it("counts more tokens for longer text", () => {
    const short = countTokens("hello");
    const long = countTokens("hello world this is a longer sentence with more tokens");
    expect(long).toBeGreaterThan(short);
  });

  it("works with cl100k_base encoding", () => {
    const count = countTokens("test", "cl100k_base");
    expect(count).toBeGreaterThan(0);
  });

  it("works with o200k_base encoding", () => {
    const count = countTokens("test", "o200k_base");
    expect(count).toBeGreaterThan(0);
  });

  it("different encodings may produce different counts", () => {
    const text = "function hello() { return 'world'; }";
    const cl100k = countTokens(text, "cl100k_base");
    const o200k = countTokens(text, "o200k_base");
    // Both should be positive; they may or may not differ
    expect(cl100k).toBeGreaterThan(0);
    expect(o200k).toBeGreaterThan(0);
  });
});
