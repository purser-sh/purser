import { describe, expect, test } from "bun:test";
import { classifyShellCommand } from "./shell-classify.ts";
import { ApprovedShellCommand } from "./shell-execute.ts";
import { runGatedTool } from "./generic-llm/tools.ts";

// @ts-expect-error ApprovedShellCommand constructor is private — only approval handlers may mint one
const _forbiddenShell: ApprovedShellCommand = new ApprovedShellCommand("echo hi", {
  kind: "read_only",
  effect: "test",
});

const runBashGate = {
  ok: true as const,
  name: "run_bash" as const,
  args: { command: "echo hi" },
};

// @ts-expect-error run_bash requires approvedShell at compile time
void runGatedTool({ gate: runBashGate, cwd: ".", mutationPolicy: "commit-immediate" });

describe("ApprovedShellCommand type guard", () => {
  test("mints only through fromImmediate and fromApproval", () => {
    const classification = classifyShellCommand("echo hi");
    expect(classification.kind).toBe("read_only");
    if (classification.kind !== "read_only") {
      return;
    }
    expect(ApprovedShellCommand.fromImmediate("echo hi", classification)).toBeInstanceOf(ApprovedShellCommand);
    expect(ApprovedShellCommand.fromApproval("echo hi", classification)).toBeInstanceOf(ApprovedShellCommand);
  });
});
