import { describe, expect, test } from "bun:test";
import { redact } from "./redact.ts";

describe("redact", () => {
  test("masks secret fields and inline tokens", () => {
    expect(redact({ token: "abc", nested: { apiKey: "xyz" } })).toEqual({
      token: "[redacted]",
      nested: { apiKey: "[redacted]" },
    });
    expect(redact('token="super-secret"')).toBe('token="[redacted]"');
  });
});
