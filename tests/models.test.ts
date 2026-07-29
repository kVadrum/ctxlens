import { describe, it, expect } from "vitest";
import {
  getAllModels,
  getModel,
  getDefaultModel,
  resolveModelId,
  unknownModelMessage,
  DEFAULT_MODEL_ID,
} from "../src/core/models.js";

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
    const model = getModel("claude-sonnet-5");
    expect(model).toBeDefined();
    expect(model!.provider).toBe("Anthropic");
    expect(model!.contextWindow).toBe(1000000);
  });

  it("returns undefined for unknown model", () => {
    expect(getModel("nonexistent-model")).toBeUndefined();
  });

  it("returns default model", () => {
    const model = getDefaultModel();
    expect(model.id).toBe("claude-sonnet-5");
  });

  it("default model ID resolves to a real registry entry", () => {
    // getDefaultModel() asserts non-null, so retiring this ID from the registry
    // would crash every no-flag invocation rather than fail here.
    expect(getModel(DEFAULT_MODEL_ID)).toBeDefined();
  });
});

describe("model resolution precedence", () => {
  // Documented contract (project CLAUDE.md): CLI flag > env > .ctxlensrc > default.
  it("prefers the CLI flag over every other layer", () => {
    expect(resolveModelId("o3", { defaultModel: "gpt-4o" }, { CTXLENS_MODEL: "gpt-4.1" })).toBe("o3");
  });

  it("honours an explicit flag that happens to equal the default", () => {
    // Regression: the flag was once compared against the default *value* to infer
    // "flag absent", so naming the default outright let env/config silently win —
    // the tool then budgeted against a model the user had explicitly ruled out.
    expect(
      resolveModelId(DEFAULT_MODEL_ID, { defaultModel: "gpt-4o" }, { CTXLENS_MODEL: "gpt-4o" }),
    ).toBe(DEFAULT_MODEL_ID);
  });

  it("prefers the env var over config and default", () => {
    expect(resolveModelId(undefined, { defaultModel: "gpt-4o" }, { CTXLENS_MODEL: "o3" })).toBe("o3");
  });

  it("prefers config over the default", () => {
    expect(resolveModelId(undefined, { defaultModel: "gpt-4o" }, {})).toBe("gpt-4o");
  });

  it("falls back to the default when no layer supplies one", () => {
    expect(resolveModelId(undefined, {}, {})).toBe(DEFAULT_MODEL_ID);
  });

  it("treats a set-but-empty layer as no opinion", () => {
    // `CTXLENS_MODEL=` is what a CI runner produces for an unset input, and `??`
    // would happily resolve it to "" — failing every command with `Unknown model: `.
    expect(resolveModelId(undefined, {}, { CTXLENS_MODEL: "" })).toBe(DEFAULT_MODEL_ID);
    expect(resolveModelId(undefined, { defaultModel: "  " }, {})).toBe(DEFAULT_MODEL_ID);
    expect(resolveModelId(undefined, { defaultModel: "gpt-4o" }, { CTXLENS_MODEL: "" })).toBe("gpt-4o");
  });
});

describe("unknown model message", () => {
  it("points a retired ID at its same-vendor successors", () => {
    const msg = unknownModelMessage("claude-sonnet-4-6");
    expect(msg).toContain("claude-sonnet-5");
    expect(msg).toContain("Unknown model: claude-sonnet-4-6");
  });

  it("does not claim an empty ID was requested", () => {
    expect(unknownModelMessage("")).toContain("(empty)");
  });

  it("omits the vendor hint when nothing matches", () => {
    expect(unknownModelMessage("nonexistent-thing")).not.toContain("same vendor");
  });
});
