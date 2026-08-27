import { describe, expect, test } from "bun:test";
import { augmentProcessPath } from "./path-env.ts";
import { which } from "./cli/which.ts";

describe("runner PATH augmentation", () => {
  test("adds Cursor bundled rg when the inherited PATH is minimal", () => {
    const saved = process.env.PATH;
    process.env.PATH = "/usr/bin:/bin";
    try {
      augmentProcessPath();
      const rg = which("rg");
      if (rg === null) {
        expect(process.env.PATH?.length).toBeGreaterThan("/usr/bin:/bin".length);
        return;
      }
      expect(rg).toContain("ripgrep");
    } finally {
      process.env.PATH = saved;
    }
  });
});
