/**
 * Shared formatting utilities for ctxlens.
 */

/** Formats a raw token count into a human-readable string (e.g. "1.2k", "3.5M"). */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
