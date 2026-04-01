/**
 * File discovery engine for ctxlens.
 *
 * Walks a directory tree, respects .gitignore rules, filters out binary files,
 * and returns the text content of every qualifying source file. Built-in ignore
 * patterns cover common non-code artifacts (images, fonts, lock files, build
 * output, etc.) so scans are useful out of the box.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ignore, { type Ignore } from "ignore";

/** Maximum file size to read (10 MB). Larger files are skipped. */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Patterns ignored by default — binaries, build output, deps, media. */
const DEFAULT_IGNORE = [
  // Dependencies & environments
  "node_modules",
  ".git",
  ".claude",
  ".venv",
  "venv",
  "__pycache__",
  ".tox",

  // Build output
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  "target",

  // Lock files
  "*.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",

  // Minified / source maps
  "*.min.js",
  "*.min.css",
  "*.map",

  // Binary / media
  "*.wasm",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.ico",
  "*.svg",
  "*.woff",
  "*.woff2",
  "*.ttf",
  "*.eot",
  "*.mp3",
  "*.mp4",
  "*.webm",
  "*.webp",
  "*.pdf",
  "*.zip",
  "*.tar",
  "*.gz",
  "*.br",

  // Compiled / native
  "*.exe",
  "*.dll",
  "*.so",
  "*.dylib",
  "*.o",
  "*.pyc",
  "*.class",
];

/** Options that control which files the scanner includes or skips. */
export interface ScanOptions {
  /** Whether to parse and respect the repo's .gitignore file. Default: true. */
  respectGitignore: boolean;
  /** Extra glob patterns to ignore on top of defaults and .gitignore. */
  extraIgnore: string[];
  /** If non-empty, only files matching these globs are included. */
  include: string[];
  /** Glob patterns to exclude (alias for extraIgnore in CLI). */
  exclude: string[];
}

/** A single file discovered by the scanner, with its content loaded. */
export interface ScannedFile {
  /** Absolute path on disk. */
  path: string;
  /** Path relative to the scan root — used for display and grouping. */
  relativePath: string;
  /** Full text content of the file (UTF-8). */
  content: string;
  /** Line count (newline-delimited). */
  lines: number;
}

/**
 * Loads the .gitignore from {@link rootPath} (if present) and merges it
 * with the built-in default ignore list.
 */
function loadGitignore(rootPath: string): Ignore {
  const ig = ignore();
  ig.add(DEFAULT_IGNORE);
  try {
    const gitignoreContent = readFileSync(join(rootPath, ".gitignore"), "utf-8");
    ig.add(gitignoreContent);
  } catch {
    // no .gitignore — that's fine
  }
  return ig;
}

/**
 * Quick binary check — scans the first 8 KB for null bytes.
 * Avoids feeding images, compiled output, etc. into the tokenizer.
 */
function isBinary(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, 8000);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

/**
 * Recursively scans {@link rootPath} and returns every qualifying text file.
 *
 * Files are filtered through (in order):
 * 1. Built-in default ignore patterns
 * 2. The repo's `.gitignore` (unless `respectGitignore` is false)
 * 3. Extra ignore / exclude patterns from options
 * 4. Include filter (if provided — only matching files pass)
 * 5. Binary detection (null-byte heuristic)
 *
 * @param rootPath - Absolute path to the directory to scan.
 * @param options  - Optional overrides for ignore/include behavior.
 * @returns Array of {@link ScannedFile} objects, one per qualifying file.
 */
export function scanDirectory(
  rootPath: string,
  options: Partial<ScanOptions> = {},
): ScannedFile[] {
  const opts: ScanOptions = {
    respectGitignore: true,
    extraIgnore: [],
    include: [],
    exclude: [],
    ...options,
  };

  const ig = opts.respectGitignore ? loadGitignore(rootPath) : ignore();
  if (opts.extraIgnore.length > 0) ig.add(opts.extraIgnore);
  if (opts.exclude.length > 0) ig.add(opts.exclude);

  const includeFilter =
    opts.include.length > 0 ? ignore().add(opts.include) : null;

  const files: ScannedFile[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const rel = relative(rootPath, fullPath);

      if (ig.ignores(rel)) continue;

      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        if (includeFilter && !includeFilter.ignores(rel)) continue;
        if (stat.size > MAX_FILE_SIZE) continue;

        try {
          const buffer = readFileSync(fullPath);
          if (isBinary(buffer)) continue;

          const content = buffer.toString("utf-8");
          files.push({
            path: fullPath,
            relativePath: rel,
            content,
            lines: content.split("\n").length,
          });
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  walk(rootPath);
  return files;
}
