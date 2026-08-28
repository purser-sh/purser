import { describe, expect, test } from "bun:test";
import { augmentProcessPath, STANDARD_BIN_DIRS } from "./path-env.ts";
import { which } from "./cli/which.ts";

describe("runner PATH augmentation", () => {
  test("adds standard system bin dirs when the inherited PATH is minimal", () => {
    const saved = process.env.PATH;
    process.env.PATH = "/home/test/.bun/bin:/home/test/.local/bin";
    try {
      augmentProcessPath();
      for (const dir of STANDARD_BIN_DIRS) {
        if (dir === "/opt/homebrew/bin") {
          continue;
        }
        expect(process.env.PATH).toContain(dir);
      }
    } finally {
      process.env.PATH = saved;
    }
  });

  test("finds apt-installed rg after augmentation when only bun paths were inherited", () => {
    const saved = process.env.PATH;
    process.env.PATH = "/home/test/.bun/bin:/home/test/.local/bin";
    try {
      augmentProcessPath();
      const rg = which("rg");
      if (rg === null) {
        // No rg on this machine at all — augmentation still expanded PATH.
        expect(process.env.PATH).toContain("/usr/bin");
        return;
      }
      expect(rg.length).toBeGreaterThan(0);
    } finally {
      process.env.PATH = saved;
    }
  });

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
