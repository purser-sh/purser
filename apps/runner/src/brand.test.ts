import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { banner, gate, header } from "./brand.ts";
import { CLI_VERSION } from "./cli-version.ts";

const ANSI = /\x1b\[/;
const BLOCK = /[█▀▄]/;

const savedEnv: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined): void {
  if (!(key in savedEnv)) {
    savedEnv[key] = process.env[key];
  }
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
    delete savedEnv[key];
  }
});

describe("terminal identity", () => {
  test("banner() with NO_COLOR=1 contains no ANSI escape sequences", () => {
    setEnv("NO_COLOR", "1");
    setEnv("FORCE_COLOR", undefined);
    setEnv("PURSER_ASCII", undefined);
    const text = banner("0.1.0");
    expect(text).not.toMatch(ANSI);
    expect(text).toContain(">|  purser 0.1.0");
  });

  test("banner() with PURSER_ASCII=1 returns the plain >| form and no block characters", () => {
    setEnv("NO_COLOR", undefined);
    setEnv("FORCE_COLOR", "1");
    setEnv("PURSER_ASCII", "1");
    const text = banner("0.1.0");
    expect(text).toContain(">|  purser 0.1.0");
    expect(text).not.toMatch(BLOCK);
  });

  test("header() is exactly one line", () => {
    setEnv("NO_COLOR", "1");
    const text = header("0.1.0", "~/work");
    expect(text.includes("\n")).toBe(false);
    expect(text.length).toBeGreaterThan(0);
  });

  test('gate("x") ends with x and prefixes it', () => {
    setEnv("NO_COLOR", "1");
    const text = gate("x");
    expect(text.endsWith("x")).toBe(true);
    expect(text.startsWith("x")).toBe(false);
    expect(text).toContain("x");
    expect(text.length).toBeGreaterThan(1);
  });
});

describe("CLI banner call sites", () => {
  test("a normal run does not print the banner", async () => {
    const home = mkdtempSync(join(tmpdir(), "purser-brand-"));
    const port = 18000 + Math.floor(Math.random() * 2000);
    writeFileSync(
      join(home, "config.json"),
      `${JSON.stringify({
        token: "test-token-1234567890",
        port,
        allowedRoots: [home],
        cliBannerShown: true,
      }, null, 2)}\n`,
      { mode: 0o600 },
    );

    const child = Bun.spawn({
      cmd: ["bun", join(import.meta.dir, "index.ts")],
      cwd: join(import.meta.dir, "../../.."),
      env: {
        ...process.env,
        PURSER_HOME: home,
        PURSER_PORT: String(port),
        PURSER_NO_BROWSER: "1",
        PURSER_DATABASE_URL: ":memory:",
        NO_COLOR: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    let captured = "";
    const deadline = Date.now() + 10000;
    const reader = child.stdout.getReader();
    const decoder = new TextDecoder();
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (value) {
        captured += decoder.decode(value, { stream: true });
      }
      if (captured.includes("listening") || done) {
        break;
      }
    }
    reader.releaseLock();
    child.kill();
    await Promise.race([child.exited, Bun.sleep(1000)]);

    expect(captured.length).toBeGreaterThan(0);
    expect(captured).not.toContain("Approve every change before it lands.");
    expect(captured).not.toContain(">|  purser");
  }, 15_000);

  test("the banner prints on --help and --version", async () => {
    for (const flag of ["--help", "--version"] as const) {
      const child = Bun.spawn({
        cmd: ["bun", join(import.meta.dir, "index.ts"), flag],
        cwd: join(import.meta.dir, "../../.."),
        env: {
          ...process.env,
          NO_COLOR: "1",
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = await new Response(child.stdout).text();
      await child.exited;
      expect(out).toContain(">|  purser");
      expect(out).toContain("Approve every change before it lands.");
      expect(out).toContain(CLI_VERSION);
    }
  });
});
