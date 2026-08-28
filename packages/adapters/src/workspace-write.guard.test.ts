import { describe, expect, test } from "bun:test";
import { ApprovedChange, StagedChange } from "./workspace-write.ts";

// @ts-expect-error ApprovedChange constructor is private — only approval handlers may mint one
const _forbidden: ApprovedChange = new ApprovedChange("README.md", "content", 0);

describe("ApprovedChange type guard", () => {
  test("mints only through fromImmediate and fromApproval", () => {
    const staged = StagedChange.create({
      path: "README.md",
      newContent: "after",
      oldContent: "before",
      patch: "",
      added: 1,
      removed: 1,
    });
    expect(ApprovedChange.fromImmediate(staged)).toBeInstanceOf(ApprovedChange);
    expect(ApprovedChange.fromApproval(staged, { kind: "approve" })).toBeInstanceOf(ApprovedChange);
  });
});
