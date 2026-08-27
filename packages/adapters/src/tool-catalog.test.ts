import { describe, expect, test } from "bun:test";
import { ADAPTER_TOOL_SURFACES, purserHostedTools } from "./tool-catalog.ts";
import { TOOL_DEFINITIONS } from "./generic-llm/tools.ts";

describe("adapter tool catalog", () => {
  test("ollama registers read and write tools including apply_patch", () => {
    const surface = ADAPTER_TOOL_SURFACES.ollama;
    expect(surface?.kind).toBe("purser_hosted");
    if (surface?.kind !== "purser_hosted") {
      return;
    }
    expect(surface.tools).toContain("read_file");
    expect(surface.tools).toContain("write_file");
    expect(surface.tools).toContain("apply_patch");
    expect(surface.tools).toContain("ripgrep_search");
  });

  test("perplexity is research-only", () => {
    const surface = ADAPTER_TOOL_SURFACES.perplexity;
    expect(surface?.kind).toBe("purser_hosted");
    if (surface?.kind !== "purser_hosted") {
      return;
    }
    expect(surface.tools).toEqual(["web_search"]);
  });

  test("hosted tool definitions match the catalog list", () => {
    const names = TOOL_DEFINITIONS.map((tool) => tool.function.name);
    expect(names).toEqual(purserHostedTools(true));
  });
});
