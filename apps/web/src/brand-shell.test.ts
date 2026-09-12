import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("console HTML shell brand", () => {
  test("the console HTML shell references a favicon that exists on disk", () => {
    const html = readFileSync(join(webRoot, "index.html"), "utf8");
    const match = html.match(/rel="icon"[^>]*href="([^"]+)"/);
    expect(match).not.toBeNull();
    const href = match![1]!;
    expect(href.startsWith("/")).toBe(true);
    const onDisk = join(webRoot, "public", href.slice(1));
    expect(existsSync(onDisk)).toBe(true);
  });
});
