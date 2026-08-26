import { describe, expect, test } from "bun:test";
import { familyForModel, openAiEncodingForModel } from "./model-family.ts";

describe("familyForModel", () => {
  test("maps OpenAI-native model ids", () => {
    expect(familyForModel("gpt-4o")).toBe("openai");
    expect(familyForModel("gpt-5")).toBe("openai");
    expect(familyForModel("o3")).toBe("openai");
    expect(familyForModel("o4-mini")).toBe("openai");
  });

  test("maps Anthropic ids including Claude Code aliases", () => {
    expect(familyForModel("claude-sonnet-4-6")).toBe("anthropic");
    expect(familyForModel("sonnet")).toBe("anthropic");
  });

  test("maps Gemini ids", () => {
    expect(familyForModel("gemini-2.5-pro")).toBe("google");
  });

  test("does not treat OpenAI-compatible hosts as OpenAI BPE", () => {
    expect(familyForModel("grok-4.6")).toBe("unknown");
    expect(familyForModel("sonar-pro")).toBe("unknown");
    expect(familyForModel("llama3.2")).toBe("unknown");
    expect(familyForModel("mistral")).toBe("unknown");
  });

  test("empty or unrecognized ids are unknown", () => {
    expect(familyForModel("")).toBe("unknown");
    expect(familyForModel("auto")).toBe("unknown");
    expect(familyForModel("composer-2")).toBe("unknown");
  });
});

describe("openAiEncodingForModel", () => {
  test("Codex defaults use o200k_base, not the package default cl100k_base", () => {
    expect(openAiEncodingForModel("gpt-5")).toEqual({ kind: "o200k_base" });
    expect(openAiEncodingForModel("o3")).toEqual({ kind: "o200k_base" });
    expect(openAiEncodingForModel("o4-mini")).toEqual({ kind: "o200k_base" });
  });

  test("legacy GPT-4 uses cl100k_base", () => {
    expect(openAiEncodingForModel("gpt-4")).toEqual({ kind: "cl100k_base" });
    expect(openAiEncodingForModel("gpt-3.5-turbo")).toEqual({ kind: "cl100k_base" });
  });
});
