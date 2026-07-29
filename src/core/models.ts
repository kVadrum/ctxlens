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
/**
 * Models dropped from the registry, mapped to what replaced them.
 *
 * The registry is curated to the current lineup rather than accumulating every
 * model ever served, so an upgrade can remove an ID that a `.ctxlensrc` written
 * months ago — or `ctxlens init` at the time — still names. Without this, config
 * outranks the default and lookup is exact, so those projects fail *every*
 * command after upgrading rather than just drifting a version behind.
 *
 * Each pair must be budget-equivalent (same context window, same input price) so
 * substituting changes the reported name and nothing else; retire a model into
 * this map only when that holds, and drop the entry once configs have moved on.
 */
const RETIRED_MODEL_IDS: Record<string, string> = {
  "claude-sonnet-4-6": "claude-sonnet-5",
  "claude-opus-4-8": "claude-opus-5",
};

/** Result of resolving a model ID, recording any retired-ID substitution. */
export interface ResolvedModelId {
  /** The ID to look up — already migrated if the requested one was retired. */
  id: string;
  /** The retired ID that was asked for, when a substitution happened. */
  migratedFrom?: string;
}

export function resolveModelId(
  flag: string | undefined,
  config: CtxlensConfig,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedModelId {
  // Blank-skipping is load-bearing, not defensive: `??` only guards null and
  // undefined, so `CTXLENS_MODEL=` (set-but-empty, the shape CI runners produce
  // for an unset input) would satisfy it and resolve to "", failing every command
  // with `Unknown model: `. An empty layer means "I have no opinion", not "".
  const layers = [flag, env.CTXLENS_MODEL, config.defaultModel];
  const requested = layers.find((v) => v != null && v.trim() !== "")?.trim() ?? DEFAULT_MODEL_ID;

  // A custom model definition wins over the retirement map — someone who defines
  // the old ID themselves in .ctxlensrc means that definition, not our successor.
  const successor = RETIRED_MODEL_IDS[requested];
  if (successor == null || getAllModels().some((m) => m.id === requested)) {
    return { id: requested };
  }
  return { id: successor, migratedFrom: requested };
}

/**
 * Error text for a `--model` value that isn't in the registry.
 *
 * Shared so the five commands can't drift, and so a retired ID gets a usable exit
 * rather than a dead end: models are curated to the current lineup, so upgrading
 * can strip an ID that a `.ctxlensrc` written months ago still names. Listing the
 * same-vendor models turns "Unknown model: claude-sonnet-4-6" into a message that
 * shows the successor.
 */
export function unknownModelMessage(id: string): string {
  const vendorPrefix = id.split("-")[0]?.toLowerCase() ?? "";
  const kin = vendorPrefix
    ? getAllModels().filter((m) => m.id.toLowerCase().startsWith(`${vendorPrefix}-`))
    : [];
  const hint = kin.length ? ` Available from the same vendor: ${kin.map((m) => m.id).join(", ")}.` : "";
  return `Unknown model: ${id || "(empty)"}.${hint} Run 'ctxlens models' to see available models.`;
}
