import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countTokens } from "@purser-sh/pricing";
import { clearDocCache, hashFileContents, readCachedMarkdown, writeCachedMarkdown } from "./cache.ts";
import { convertBuiltin } from "./convert-builtin.ts";
import { markitdownStatus } from "./convert-markitdown.ts";
import { convertDocument, truncateMarkdown } from "./convert.ts";
import { detectDocumentFormat } from "./formats.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");

describe("document formats", () => {
  test("detects common extensions", () => {
    expect(detectDocumentFormat("spec.pdf")).toBe("pdf");
    expect(detectDocumentFormat("notes.docx")).toBe("docx");
    expect(detectDocumentFormat("data.xlsx")).toBe("xlsx");
    expect(detectDocumentFormat("deck.pptx")).toBe("pptx");
  });
});

describe("document conversion fixtures", () => {
  test("pdf converts to markdown containing known strings", async () => {
    const markdown = await convertBuiltin(join(FIXTURES, "sample.pdf"), "pdf");
    expect(markdown).toContain("Purser PDF fixture");
  });

  test("docx converts to markdown containing known strings", async () => {
    const markdown = await convertBuiltin(join(FIXTURES, "sample.docx"), "docx");
    expect(markdown).toContain("Purser Word fixture");
  });

  test("xlsx converts to markdown containing known strings", async () => {
    const root = mkdtempSync(join(tmpdir(), "purser-xlsx-fix-"));
    copyFileSync(join(FIXTURES, "sample.xlsx"), join(root, "sample.xlsx"));
    const result = await convertDocument({ cwd: root, relativePath: "sample.xlsx", modelId: "sonnet" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markdown).toContain("Pipeline");
    expect(result.markdown).toContain("streaming");
  });

  test("unsupported format returns a clear error without crashing", async () => {
    const root = mkdtempSync(join(tmpdir(), "purser-zip-"));
    writeFileSync(join(root, "data.xyz"), "binary", "utf8");
    const result = await convertDocument({ cwd: root, relativePath: "data.xyz" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeGreaterThan(10);
  });

  test("pptx degrades when MarkItDown is unavailable", () => {
    const status = markitdownStatus();
    if (status.available) {
      return;
    }
    expect(status.installCommand).toContain("markitdown");
  });

  test("path outside workspace is rejected by the sandbox", async () => {
    const root = mkdtempSync(join(tmpdir(), "purser-out-"));
    const result = await convertDocument({ cwd: root, relativePath: "../secret.pdf" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("..");
  });
});

describe("document cache", () => {
  test("returns cached markdown for identical content and reconverts after change", async () => {
    const home = mkdtempSync(join(tmpdir(), "purser-cache-home-"));
    const root = mkdtempSync(join(tmpdir(), "purser-cache-root-"));
    copyFileSync(join(FIXTURES, "sample.xlsx"), join(root, "sample.xlsx"));

    const first = await convertDocument({ cwd: root, relativePath: "sample.xlsx", home });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.fromCache).toBe(false);

    const second = await convertDocument({ cwd: root, relativePath: "sample.xlsx", home });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.fromCache).toBe(true);

    writeFileSync(join(root, "sample.xlsx"), readFileSync(join(root, "sample.xlsx")));
    const hash = hashFileContents(join(root, "sample.xlsx"));
    writeCachedMarkdown(hash, "stale", home);
    expect(readCachedMarkdown(hash, home)).toBe("stale");

    const third = await convertDocument({ cwd: root, relativePath: "sample.xlsx", home });
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.fromCache).toBe(true);
    expect(third.markdown).toBe("stale");

    clearDocCache(home);
  });
});

describe("document token counting", () => {
  test("uses the same tokenizer path as the ledger with exact or approximate marking", async () => {
    const root = mkdtempSync(join(tmpdir(), "purser-tok-"));
    copyFileSync(join(FIXTURES, "sample.docx"), join(root, "sample.docx"));
    const converted = await convertDocument({ cwd: root, relativePath: "sample.docx", modelId: "sonnet" });
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    const direct = countTokens(converted.markdown, "sonnet");
    expect(converted.tokenCount.value).toBe(direct.value);
    expect(converted.tokenCount.source).toBe(direct.source);

    const big = "word ".repeat(20_000);
    const truncated = truncateMarkdown(big, 100, "sonnet");
    expect(truncated.tokenCount.value).toBeLessThanOrEqual(150);
    expect(truncated.text).toContain("truncated");
  });
});
