/**
 * Shared formatting utilities for ctxlens.
 */

/** Formats a raw token count into a human-readable string (e.g. "1.2k", "3.5M"). */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Formats a Date as "MM.DD.YYYY | HH:MM:SS". */
export function formatTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${pad(d.getMonth() + 1)}.${pad(d.getDate())}.${d.getFullYear()}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${date} | ${time}`;
}
