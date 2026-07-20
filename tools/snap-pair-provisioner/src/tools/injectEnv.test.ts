import { describe, it, expect, vi } from "vitest";
import { injectEnvVariables } from "./injectEnv.js";

const sdk = JSON.stringify({
  result: { sdkConfig: {
    apiKey: "AIza-x", authDomain: "p.firebaseapp.com",
    databaseURL: "https://p-default-rtdb.firebaseio.com",
    projectId: "p", storageBucket: "p.appspot.com",
    messagingSenderId: "123", appId: "1:123:web:abc",
  } },
});

describe("injectEnvVariables", () => {
  it("writes prefixed keys, merging with existing .env", async () => {
    let written = "";
    const deps = {
      fb: vi.fn(async () => sdk),
      readFile: vi.fn(async () => "EXISTING=1\nVITE_FIREBASE_API_KEY=old\n"),
      writeFile: vi.fn(async (_p: string, c: string) => { written = c; }),
    };
    const summary = await injectEnvVariables(
      { projectId: "p", targetEnvPath: "/tmp/.env" }, deps
    );
    expect(written).toContain("EXISTING=1");
    expect(written).toContain("VITE_FIREBASE_API_KEY=AIza-x");
    expect(written).toContain("VITE_FIREBASE_DATABASE_URL=https://p-default-rtdb.firebaseio.com");
    expect(summary).toMatch(/7/); // 7 keys written
  });

  it("treats a missing .env as empty", async () => {
    const deps = {
      fb: vi.fn(async () => sdk),
      readFile: vi.fn(async () => { throw new Error("ENOENT"); }),
      writeFile: vi.fn(async () => {}),
    };
    const summary = await injectEnvVariables(
      { projectId: "p", targetEnvPath: "/tmp/.env", prefix: "X_" }, deps
    );
    expect(deps.writeFile).toHaveBeenCalled();
    expect(summary).toMatch(/X_API_KEY/);
  });

  it("includes appId positioned after WEB when provided", async () => {
    const deps = {
      fb: vi.fn(async () => sdk),
      readFile: vi.fn(async () => ""),
      writeFile: vi.fn(async () => {}),
    };
    await injectEnvVariables(
      { projectId: "p", appId: "1:123:web:abc", targetEnvPath: "/tmp/.env" }, deps
    );
    expect(deps.fb).toHaveBeenCalledWith(
      ["apps:sdkconfig", "WEB", "1:123:web:abc", "--project", "p", "--json"]
    );
  });
});
