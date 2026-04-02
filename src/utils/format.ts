/**
 * Shared formatting utilities for ctxlens.
 */

/** Formats a raw token count into a human-readable string (e.g. "1.2k", "3.5M"). */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Formats an API input cost in USD (e.g. "$0.04", "$1.23", "<$0.01"). */
export function formatCost(tokens: number, pricePerMillion: number): string {
  if (!Number.isFinite(tokens) || !Number.isFinite(pricePerMillion) || tokens < 0 || pricePerMillion < 0) {
    return "N/A";
  }
  const cost = (tokens / 1_000_000) * pricePerMillion;
  if (cost < 0.005) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}

/** Formats a Date as "MM.DD.YYYY | HH:MM:SS". */
export function formatTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${pad(d.getMonth() + 1)}.${pad(d.getDate())}.${d.getFullYear()}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${date} | ${time}`;
}
