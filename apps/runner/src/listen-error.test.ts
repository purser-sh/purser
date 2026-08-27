import { describe, expect, test } from "bun:test";
import { formatListenError, isAddressInUse } from "./listen-error.ts";

describe("listen errors", () => {
  test("names the port and how to free it on EADDRINUSE", () => {
    const error = Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" });
    const text = formatListenError(error, 7420);
    expect(text).toContain("7420");
    expect(text).toContain("lsof -ti:7420");
    expect(text).not.toMatch(/at Server\.emit|node:events|emitError/);
    expect(isAddressInUse(error)).toBe(true);
  });
});
