import { describe, it, expect, vi } from "vitest";
import { makeFb } from "./firebaseCli.js";

describe("makeFb", () => {
  it("returns stdout on success", async () => {
    const exec = vi.fn(async () => ({ stdout: "ok-output" }));
    const fb = makeFb(exec as any);
    expect(await fb(["projects:list"])).toBe("ok-output");
    expect(exec).toHaveBeenCalledWith("firebase", ["projects:list"], expect.any(Object));
  });

  it("normalizes auth failure to code NOT_LOGGED_IN", async () => {
    const exec = vi.fn(async () => {
      const e: any = new Error("cmd failed");
      e.stderr = "Error: Failed to authenticate, have you run firebase login?";
      throw e;
    });
    const fb = makeFb(exec as any);
    await expect(fb(["deploy"])).rejects.toMatchObject({ code: "NOT_LOGGED_IN" });
  });

  it("passes through other errors with command context", async () => {
    const exec = vi.fn(async () => {
      const e: any = new Error("boom");
      e.stderr = "some other failure";
      throw e;
    });
    const fb = makeFb(exec as any);
    await expect(fb(["deploy"])).rejects.toThrow(/firebase deploy/);
  });

  it("does not misclassify unrelated stderr containing 'please run' and 'login' far apart as an auth error", async () => {
    const exec = vi.fn(async () => {
      const e: any = new Error("cmd failed");
      e.stderr = "Deploy failed: please run your build; login to the dashboard for logs";
      throw e;
    });
    const fb = makeFb(exec as any);
    const rejection = expect(fb(["deploy"])).rejects;
    await rejection.toThrow(/firebase deploy/);
    await rejection.not.toMatchObject({ code: "NOT_LOGGED_IN" });
  });
});
