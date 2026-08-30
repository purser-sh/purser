import { describe, expect, test } from "bun:test";
import { ADAPTER_TOOL_SURFACES, purserHostedTools } from "./tool-catalog.ts";
import { TOOL_DEFINITIONS, type ToolName } from "./generic-llm/tools.ts";

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

  test("with run_bash disabled, the tool is not sent to the model at all", () => {
    const disabled = purserHostedTools(true, { runBashEnabled: false });
    expect(disabled).not.toContain("run_bash");
    const sentToModel = TOOL_DEFINITIONS.filter((tool) =>
      disabled.includes(tool.function.name as ToolName),
    ).map((tool) => tool.function.name);
    expect(sentToModel).not.toContain("run_bash");
    expect(purserHostedTools(true, { runBashEnabled: true })).toContain("run_bash");
  });

  test("hosted tool definitions include run_bash when enabled", () => {
    const names = TOOL_DEFINITIONS.map((tool) => tool.function.name);
    expect(names).toContain("run_bash");
    expect(purserHostedTools(true)).not.toContain("run_bash");
    expect(purserHostedTools(true, { runBashEnabled: true })).toEqual(names as ToolName[]);
  });
});
