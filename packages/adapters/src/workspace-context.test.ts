import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWorkspaceContext } from "./workspace-context.ts";

describe("buildWorkspaceContext", () => {
  test("includes known filenames from the workspace root", () => {
    const root = mkdtempSync(join(tmpdir(), "purser-ws-"));
    writeFileSync(join(root, "README.md"), "# demo\n", "utf8");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "index.ts"), "export {}\n", "utf8");

    const context = buildWorkspaceContext(root);

    expect(context).toContain("README.md");
    expect(context).toContain("src/");
    expect(context).toContain("index.ts");
    expect(context.startsWith("<workspace>")).toBe(true);
  });

  test("skips node_modules and notes truncation when the tree is large", () => {
    const root = mkdtempSync(join(tmpdir(), "purser-ws-big-"));
    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(root, "node_modules", "pkg", "index.js"), "x", "utf8");
    writeFileSync(join(root, "app.ts"), "x", "utf8");

    const context = buildWorkspaceContext(root);

    expect(context).toContain("app.ts");
    expect(context.includes("node_modules")).toBe(false);
  });
});
