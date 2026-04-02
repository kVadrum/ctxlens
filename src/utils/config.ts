/**
 * Configuration loader for ctxlens.
 *
 * Looks for project-level config in two places (first match wins):
 * 1. `.ctxlensrc` (JSON) in the scan root
 * 2. `"ctxlens"` key in `package.json`
 *
 * All fields are optional — CLI flags override config values.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Shape of the `.ctxlensrc` config file or `package.json` ctxlens key. */
export interface CtxlensConfig {
  /** Default model ID when `--model` is not provided. */
  defaultModel?: string;
  /** Extra ignore patterns (stacked on top of defaults + .gitignore). */
  ignore?: string[];
  /** Include-only patterns. */
  include?: string[];
  /** Exclude patterns (stacked on top of ignore). */
  exclude?: string[];
  /** Default directory tree depth. */
  depth?: number;
  /** Default number of top entries to show. */
  top?: number;
  /** Custom model definitions. */
  customModels?: Record<
    string,
    {
      contextWindow: number;
      tokenizer: string;
      inputPrice?: number;
    }
  >;
}

/**
 * Loads config from `.ctxlensrc` or `package.json` in the given directory.
 * Returns an empty config if neither exists or parsing fails.
 */
export function loadConfig(rootPath: string): CtxlensConfig {
  // Try .ctxlensrc first
  try {
    const raw = readFileSync(join(rootPath, ".ctxlensrc"), "utf-8");
    try {
      return JSON.parse(raw) as CtxlensConfig;
    } catch {
      console.error("Warning: .ctxlensrc contains invalid JSON — using default config.");
      return {};
    }
  } catch {
    // no .ctxlensrc — try package.json
  }

  try {
    const raw = readFileSync(join(rootPath, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    if (pkg.ctxlens && typeof pkg.ctxlens === "object") {
      return pkg.ctxlens as CtxlensConfig;
    }
  } catch {
    // no package.json or no ctxlens key
  }

  return {};
}
