import { describe, expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertAllowed, isInsideRoot, PathError, resolveInsideWorkspace } from "./paths.ts";

const root = join(tmpdir(), `agentdeck-path-${crypto.randomUUID()}`);
mkdirSync(join(root, "ws", "src"), { recursive: true });
writeFileSync(join(root, "ws", "src", "app.ts"), "export {}\n");
writeFileSync(join(root, "secret.txt"), "nope\n");
symlinkSync(join(root, "secret.txt"), join(root, "ws", "escape"));

describe("path sandbox", () => {
  test("allows paths inside a root", () => {
    expect(isInsideRoot(join(root, "ws"), root)).toBe(true);
    expect(assertAllowed(join(root, "ws"), [root])).toBe(join(root, "ws"));
  });

  test("rejects paths outside the allowlist", () => {
    expect(() => assertAllowed("/etc", [root])).toThrow(PathError);
  });

  test("rejects relative traversal and symlink escapes", () => {
    expect(() => resolveInsideWorkspace(join(root, "ws"), "../secret.txt")).toThrow(PathError);
    expect(() => resolveInsideWorkspace(join(root, "ws"), "escape")).toThrow(/symlink escapes/);
    expect(resolveInsideWorkspace(join(root, "ws"), "src/app.ts")).toBe(join(root, "ws", "src", "app.ts"));
  });
});
