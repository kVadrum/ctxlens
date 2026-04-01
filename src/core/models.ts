import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  tokenizer: string;
  tokenizerNote?: string;
}

interface Registry {
  models: ModelInfo[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const registryPath = join(__dirname, "../../models/registry.json");

let cached: Registry | null = null;

function loadRegistry(): Registry {
  if (!cached) {
    cached = JSON.parse(readFileSync(registryPath, "utf-8")) as Registry;
  }
  return cached;
}

export function getAllModels(): ModelInfo[] {
  return loadRegistry().models;
}

export function getModel(id: string): ModelInfo | undefined {
  return getAllModels().find((m) => m.id === id);
}

export function getDefaultModel(): ModelInfo {
  return getModel("claude-sonnet-4-6")!;
}
