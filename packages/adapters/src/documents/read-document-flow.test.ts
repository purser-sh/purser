import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runReadDocumentFlow } from "./read-document-flow.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");

describe("runReadDocumentFlow", () => {
  test("over threshold raises askDocument and cancel returns a refusal to the model", async () => {
    const root = mkdtempSync(join(tmpdir(), "purser-doc-flow-"));
    copyFileSync(join(FIXTURES, "sample.docx"), join(root, "requirements.docx"));

    let asked = false;
    const result = await runReadDocumentFlow({
      cwd: root,
      args: { path: "requirements.docx" },
      modelId: "sonnet",
      settings: { tokenThreshold: 1 },
      requestId: "req_1",
      askDocument: async (request) => {
        asked = true;
        expect(request.path).toBe("requirements.docx");
        expect(request.tokenCount).toBeGreaterThan(1);
        return "cancel";
      },
    });

    expect(asked).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("cancelled");
    expect(result.output).toContain("not added");
  });

  test("under threshold skips askDocument and returns markdown", async () => {
    const root = mkdtempSync(join(tmpdir(), "purser-doc-flow-ok-"));
    copyFileSync(join(FIXTURES, "sample.docx"), join(root, "notes.docx"));

    let asked = false;
    const result = await runReadDocumentFlow({
      cwd: root,
      args: { path: "notes.docx" },
      modelId: "sonnet",
      settings: { tokenThreshold: 100_000 },
      requestId: "req_2",
      askDocument: async () => {
        asked = true;
        return "cancel";
      },
    });

    expect(asked).toBe(false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toContain("Purser Word fixture");
    expect(result.summary).toContain("notes.docx");
  });

  test("add_partial truncates to the threshold", async () => {
    const root = mkdtempSync(join(tmpdir(), "purser-doc-flow-partial-"));
    copyFileSync(join(FIXTURES, "sample.docx"), join(root, "big.docx"));

    const result = await runReadDocumentFlow({
      cwd: root,
      args: { path: "big.docx" },
      modelId: "sonnet",
      settings: { tokenThreshold: 1 },
      requestId: "req_3",
      askDocument: async () => "add_partial",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toContain("truncated");
  });
});
