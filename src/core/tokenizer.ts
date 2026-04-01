/**
 * Tokenization engine for ctxlens.
 *
 * Wraps @dqbd/tiktoken (WASM build) behind a minimal interface so the
 * tokenizer implementation can be swapped later (e.g. to a Rust WASM module
 * or a model-specific tokenizer) without touching the rest of the codebase.
 *
 * Encoders are cached per encoding name for the lifetime of the process.
 * Call {@link freeEncoders} when done to release WASM memory.
 */

import { get_encoding, type Tiktoken } from "@dqbd/tiktoken";

/** Cache of initialized encoders, keyed by encoding name. */
const encoderCache = new Map<string, Tiktoken>();

/**
 * Returns a cached encoder instance for the given encoding name.
 * Creates and caches a new one on first access.
 */
function getEncoder(encoding: string): Tiktoken {
  let enc = encoderCache.get(encoding);
  if (!enc) {
    enc = get_encoding(encoding as "cl100k_base" | "o200k_base");
    encoderCache.set(encoding, enc);
  }
  return enc;
}

/**
 * Counts the number of tokens in {@link text} using the specified encoding.
 *
 * @param text     - The text to tokenize.
 * @param encoding - Tiktoken encoding name. Default: `"cl100k_base"`.
 * @returns Token count.
 */
export function countTokens(text: string, encoding = "cl100k_base"): number {
  const enc = getEncoder(encoding);
  const tokens = enc.encode(text);
  return tokens.length;
}

/**
 * Frees all cached encoder instances, releasing WASM memory.
 * Should be called once at the end of a scan to avoid memory leaks.
 */
export function freeEncoders(): void {
  for (const enc of encoderCache.values()) {
    enc.free();
  }
  encoderCache.clear();
}
