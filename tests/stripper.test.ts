import { describe, it, expect } from "vitest";
import { stripComments, stripWhitespace } from "../src/core/stripper.js";

describe("stripComments", () => {
  it("strips single-line // comments", () => {
    const input = 'const x = 1; // this is a comment\nconst y = 2;';
    const result = stripComments(input);
    expect(result).toBe("const x = 1; \nconst y = 2;");
  });

  it("strips block /* */ comments", () => {
    const input = "/* header */\nconst x = 1;";
    const result = stripComments(input);
    expect(result).toBe("\nconst x = 1;");
  });

  it("strips multi-line block comments", () => {
    const input = "/**\n * JSDoc\n */\nfunction foo() {}";
    const result = stripComments(input);
    expect(result).toBe("\nfunction foo() {}");
  });

  it("strips hash comments", () => {
    const input = "# comment\nvalue = 1";
    const result = stripComments(input);
    expect(result).toBe("\nvalue = 1");
  });

  it("strips shebang lines", () => {
    const input = "#!/usr/bin/env node\nconsole.log('hi');";
    const result = stripComments(input);
    expect(result).toBe("\nconsole.log('hi');");
  });

  it("strips Python triple-quote docstrings", () => {
    const input = '"""docstring"""\ndef foo(): pass';
    const result = stripComments(input);
    expect(result).toBe("\ndef foo(): pass");
  });

  it("preserves comments inside string literals", () => {
    const input = 'const url = "http://example.com";';
    const result = stripComments(input);
    expect(result).toBe('const url = "http://example.com";');
  });

  it("preserves comments inside template literals", () => {
    const input = "const msg = `// not a comment`;";
    const result = stripComments(input);
    expect(result).toBe("const msg = `// not a comment`;");
  });

  it("handles escaped quotes in strings", () => {
    const input = 'const s = "she said \\"hi\\""; // comment';
    const result = stripComments(input);
    expect(result).toBe('const s = "she said \\"hi\\""; ');
  });

  it("handles empty input", () => {
    expect(stripComments("")).toBe("");
  });
});

describe("stripWhitespace", () => {
  it("trims trailing whitespace from lines", () => {
    const input = "hello   \nworld  ";
    const result = stripWhitespace(input);
    expect(result).toBe("hello\nworld");
  });

  it("collapses consecutive blank lines to one", () => {
    const input = "a\n\n\n\nb";
    const result = stripWhitespace(input);
    expect(result).toBe("a\n\nb");
  });

  it("trims leading and trailing blank lines", () => {
    const input = "\n\nhello\n\n";
    const result = stripWhitespace(input);
    expect(result).toBe("hello");
  });

  it("handles empty input", () => {
    expect(stripWhitespace("")).toBe("");
  });
});
