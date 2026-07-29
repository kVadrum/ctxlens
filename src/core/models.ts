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
  /** Unique identifier used in CLI flags (e.g. "claude-sonnet-5"). */
  id: string;
  /** Human-readable display name (e.g. "Claude Sonnet 5"). */
  name: string;
  /** Model provider (e.g. "Anthropic", "OpenAI"). */
  provider: string;
  /** Maximum context window size in tokens. */
  contextWindow: number;
  /** Tiktoken encoding name used for this model (e.g. "cl100k_base"). */
  tokenizer: string;
  /** Optional note when the tokenizer is an approximation (non-native). */
  tokenizerNote?: string;
  /** Input price per 1M tokens in USD. Undefined for open-weight / self-hosted models. */
  inputPrice?: number;
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
    ...(def.inputPrice != null ? { inputPrice: def.inputPrice } : {}),
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

/**
 * Model used when neither `--model`, `CTXLENS_MODEL`, nor `.ctxlensrc` picks one.
 *
 * Canonical home for this ID: every CLI command and `getDefaultModel()` reference
 * it rather than repeating the literal, so retiring a model from the registry is
 * a one-line change here instead of an 18-site sweep that silently half-lands.
 * Must always name a model present in `registry.json` — `getDefaultModel()`
 * asserts non-null, and `tests/models.test.ts` pins the pair.
 */
export const DEFAULT_MODEL_ID = "claude-sonnet-5";

/** Returns the default model used when no `--model` flag is provided. */
export function getDefaultModel(): ModelInfo {
  return getModel(DEFAULT_MODEL_ID)!;
}

/**
 * Resolves the target model ID across all four config layers, highest first:
 * CLI flag > `CTXLENS_MODEL` > `.ctxlensrc` > {@link DEFAULT_MODEL_ID}.
 *
 * Shared by every command that takes `-m/--model` so the precedence order has one
 * home. It previously lived inline in each, comparing `opts.model` against the
 * default *value* to detect "flag absent" — which made an explicit
 * `--model <the-default>` indistinguishable from no flag, so env or config
 * silently overrode it and the tool budgeted against a model the user had named
 * outright. `flag` must therefore be `undefined` when absent, never defaulted by
 * the arg parser.
 *
 * `env` is injectable so the precedence can be tested without mutating the real
 * environment.
 */
export function resolveModelId(
  flag: string | undefined,
  config: CtxlensConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return flag ?? env.CTXLENS_MODEL ?? config.defaultModel ?? DEFAULT_MODEL_ID;
}
