import { describe, expect, test } from "bun:test";
import { injectWindowBootstrap } from "./html-inject.ts";

describe("injectWindowBootstrap", () => {
  test("inserts a JSON assignment before </head>", () => {
    const html = injectWindowBootstrap("<html><head></head><body></body></html>", "__PURSER_BOOTSTRAP__", {
      wsUrl: "ws://127.0.0.1:7420",
      token: "tok",
    });
    expect(html.includes('<script>window.__PURSER_BOOTSTRAP__={"wsUrl":"ws://127.0.0.1:7420","token":"tok"};</script></head>')).toBe(
      true,
    );
  });

  test("prefixes HTML that has no head close tag", () => {
    const html = injectWindowBootstrap("<html></html>", "__PURSER_BOOTSTRAP__", { token: "x" });
    expect(html.startsWith('<script>window.__PURSER_BOOTSTRAP__={"token":"x"};</script>')).toBe(true);
  });
});
