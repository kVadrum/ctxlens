/**
 * Model registry for ctxlens.
 *
 * Loads model definitions (name, provider, context window size, tokenizer)
 * from `models/registry.json`. The registry is data-driven — adding a model
 * means adding a JSON entry, not writing code. The file is loaded once and
 * cached for the process lifetime.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { CtxlensConfig } from "../utils/config.js";

/** A single AI model's metadata relevant to token budget analysis. */
export interface ModelInfo {
  /** Unique identifier used in CLI flags (e.g. "claude-sonnet-4-6"). */
  id: string;
  /** Human-readable display name (e.g. "Claude Sonnet 4.6"). */
  name: string;
  /** Model provider (e.g. "Anthropic", "OpenAI"). */
  provider: string;
  /** Maximum context window size in tokens. */
  contextWindow: number;
  /** Tiktoken encoding name used for this model (e.g. "cl100k_base"). */
  tokenizer: string;
  /** Optional note when the tokenizer is an approximation (non-native). */
  tokenizerNote?: string;
}

interface Registry {
  models: ModelInfo[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const registryPath = join(__dirname, "../../models/registry.json");

let cached: Registry | null = null;
let customModels: ModelInfo[] = [];

function loadRegistry(): Registry {
  if (!cached) {
    cached = JSON.parse(readFileSync(registryPath, "utf-8")) as Registry;
  }
  return cached;
}

/**
 * Registers custom model definitions from .ctxlensrc config.
 * Custom models override built-in models with the same ID.
 */
export function registerCustomModels(config: CtxlensConfig): void {
  if (!config.customModels) return;
  customModels = Object.entries(config.customModels).map(([id, def]) => ({
    id,
    name: id,
    provider: "Custom",
    contextWindow: def.contextWindow,
    tokenizer: def.tokenizer,
  }));
}

/** Returns all models (built-in + custom). Custom models override built-in by ID. */
export function getAllModels(): ModelInfo[] {
  const builtIn = loadRegistry().models;
  if (customModels.length === 0) return builtIn;
  const customIds = new Set(customModels.map((m) => m.id));
  return [...builtIn.filter((m) => !customIds.has(m.id)), ...customModels];
}

/** Looks up a model by its ID. Returns `undefined` if not found. */
export function getModel(id: string): ModelInfo | undefined {
  return getAllModels().find((m) => m.id === id);
}

/** Returns the default model used when no `--model` flag is provided. */
export function getDefaultModel(): ModelInfo {
  return getModel("claude-sonnet-4-6")!;
}
