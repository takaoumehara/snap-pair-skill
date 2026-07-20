import { describe, it, expect } from "vitest";
import { mergeEnv } from "./envMerge.js";

describe("mergeEnv", () => {
  it("appends new keys to empty file", () => {
    const out = mergeEnv("", ["A=1", "B=2"]);
    expect(out).toBe("A=1\nB=2\n");
  });

  it("overwrites an existing key in place", () => {
    const out = mergeEnv("A=old\nB=2\n", ["A=new"]);
    expect(out).toBe("A=new\nB=2\n");
  });

  it("preserves comments and blank lines and appends unknown keys", () => {
    const out = mergeEnv("# header\n\nA=1\n", ["B=2", "A=1b"]);
    expect(out).toBe("# header\n\nA=1b\nB=2\n");
  });
});
