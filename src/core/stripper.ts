/**
 * Content stripping utilities for ctxlens.
 *
 * Removes comments and/or excess whitespace from source text before
 * tokenization, simulating what the token budget would look like if
 * AI context excluded these elements.
 *
 * These are heuristic-based — not full language parsers — but good enough
 * for budget estimation across common languages.
 */

/**
 * Strips single-line and multi-line comments from source text.
 * Handles: // line comments, /* block comments *\/, # line comments,
 * Python triple-quote docstrings (''' and \""").
 *
 * Does not handle comments inside string literals perfectly, but
 * for budget estimation this is acceptable.
 */
export function stripComments(text: string): string {
  let result = "";
  let i = 0;
  const len = text.length;

  while (i < len) {
    // Block comments: /* ... */
    if (text[i] === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? len : end + 2;
      continue;
    }

    // Line comments: //
    if (text[i] === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? len : end;
      continue;
    }

    // Hash comments: #
    if (text[i] === "#") {
      // Skip shebang lines
      if (i === 0 && text[i + 1] === "!") {
        const end = text.indexOf("\n", i);
        i = end === -1 ? len : end;
        continue;
      }
      const end = text.indexOf("\n", i);
      i = end === -1 ? len : end;
      continue;
    }

    // Python triple-quote docstrings
    if (
      (text[i] === '"' && text[i + 1] === '"' && text[i + 2] === '"') ||
      (text[i] === "'" && text[i + 1] === "'" && text[i + 2] === "'")
    ) {
      const quote = text.slice(i, i + 3);
      const end = text.indexOf(quote, i + 3);
      i = end === -1 ? len : end + 3;
      continue;
    }

    // String literals — skip to avoid stripping comments inside strings
    if (text[i] === '"' || text[i] === "'") {
      const quote = text[i];
      result += quote;
      i++;
      while (i < len && text[i] !== quote) {
        if (text[i] === "\\") {
          result += text[i];
          i++;
        }
        if (i < len) {
          result += text[i];
          i++;
        }
      }
      if (i < len) {
        result += text[i]; // closing quote
        i++;
      }
      continue;
    }

    // Template literals
    if (text[i] === "`") {
      result += text[i];
      i++;
      while (i < len && text[i] !== "`") {
        if (text[i] === "\\") {
          result += text[i];
          i++;
        }
        if (i < len) {
          result += text[i];
          i++;
        }
      }
      if (i < len) {
        result += text[i];
        i++;
      }
      continue;
    }

    result += text[i];
    i++;
  }

  return result;
}

/**
 * Collapses excess whitespace: removes blank lines, trims trailing
 * whitespace, and collapses multiple consecutive blank lines into one.
 */
export function stripWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, idx, arr) => {
      // Remove consecutive blank lines (keep at most one)
      if (line === "" && idx > 0 && arr[idx - 1] === "") return false;
      return true;
    })
    .join("\n")
    .trim();
}
