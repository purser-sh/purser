import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { injectBootstrap, resolveUiFile, resolveUiRelPath } from "./ui-serve.ts";

describe("embedded UI", () => {
  test("injects bootstrap into head without putting the token in a JSON route", () => {
    const html = injectBootstrap("<html><head></head><body></body></html>", {
      wsUrl: "ws://127.0.0.1:7420",
      token: "test-token-1234567890",
      allowedRoots: ["/home/me"],
    });
    expect(html.includes("window.__AGENTDECK_BOOTSTRAP__")).toBe(true);
    expect(html.includes("test-token-1234567890")).toBe(true);
    expect(html.includes("</head>")).toBe(true);
  });

  test("maps / and /phone to index.html and rejects traversal", () => {
    expect(resolveUiRelPath("/")).toBe("index.html");
    expect(resolveUiRelPath("/phone")).toBe("index.html");
    expect(resolveUiRelPath("/assets/app.js")).toBe("assets/app.js");
    expect(resolveUiRelPath("/../secret")).toBeUndefined();
  });

  test("refuses to read a file outside the UI directory", () => {
    const dir = mkdtempSync(join("/home/aksingh/AgentDeck", ".tmp-ui-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), "<html></html>\n");
    expect(resolveUiFile(dir, "index.html")?.endsWith("index.html")).toBe(true);
    expect(resolveUiFile(dir, join("..", "package.json"))).toBeUndefined();
  });
});
