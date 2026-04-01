import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ignore, { type Ignore } from "ignore";

const DEFAULT_IGNORE = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  "target",
  "*.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "*.min.js",
  "*.min.css",
  "*.map",
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
  "*.exe",
  "*.dll",
  "*.so",
  "*.dylib",
  "*.o",
  "*.pyc",
  "*.class",
];

export interface ScanOptions {
  respectGitignore: boolean;
  extraIgnore: string[];
  include: string[];
  exclude: string[];
}

export interface ScannedFile {
  path: string;
  relativePath: string;
  content: string;
  lines: number;
}

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

function isBinary(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, 8000);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

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
