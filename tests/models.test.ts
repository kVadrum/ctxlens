import { describe, it, expect } from "vitest";
import { getAllModels, getModel, getDefaultModel } from "../src/core/models.js";

describe("model registry", () => {
  it("loads all models from registry", () => {
    const models = getAllModels();
    expect(models.length).toBeGreaterThan(0);
  });

  it("each model has required fields", () => {
    for (const model of getAllModels()) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.provider).toBeTruthy();
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.tokenizer).toBeTruthy();
    }
  });

  it("finds a known model by ID", () => {
    const model = getModel("claude-sonnet-4-6");
    expect(model).toBeDefined();
    expect(model!.provider).toBe("Anthropic");
    expect(model!.contextWindow).toBe(200000);
  });

  it("returns undefined for unknown model", () => {
    expect(getModel("nonexistent-model")).toBeUndefined();
  });

  it("returns default model", () => {
    const model = getDefaultModel();
    expect(model.id).toBe("claude-sonnet-4-6");
  });
});
