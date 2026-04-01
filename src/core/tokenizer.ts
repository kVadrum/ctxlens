import { get_encoding, type Tiktoken } from "@dqbd/tiktoken";

const encoderCache = new Map<string, Tiktoken>();

function getEncoder(encoding: string): Tiktoken {
  let enc = encoderCache.get(encoding);
  if (!enc) {
    enc = get_encoding(encoding as "cl100k_base" | "o200k_base");
    encoderCache.set(encoding, enc);
  }
  return enc;
}

export function countTokens(text: string, encoding = "cl100k_base"): number {
  const enc = getEncoder(encoding);
  const tokens = enc.encode(text);
  return tokens.length;
}

export function freeEncoders(): void {
  for (const enc of encoderCache.values()) {
    enc.free();
  }
  encoderCache.clear();
}
