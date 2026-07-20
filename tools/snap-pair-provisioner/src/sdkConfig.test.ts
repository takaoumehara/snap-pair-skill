import { describe, it, expect } from "vitest";
import { parseSdkConfig } from "./sdkConfig.js";

const cfg = {
  apiKey: "AIza-x", authDomain: "p.firebaseapp.com",
  databaseURL: "https://p-default-rtdb.firebaseio.com",
  projectId: "p", storageBucket: "p.appspot.com",
  messagingSenderId: "123", appId: "1:123:web:abc",
};

describe("parseSdkConfig", () => {
  it("reads {result:{sdkConfig}} shape", () => {
    expect(parseSdkConfig(JSON.stringify({ result: { sdkConfig: cfg } }))).toEqual(cfg);
  });
  it("reads {sdkConfig} shape", () => {
    expect(parseSdkConfig(JSON.stringify({ sdkConfig: cfg }))).toEqual(cfg);
  });
  it("reads flat shape", () => {
    expect(parseSdkConfig(JSON.stringify(cfg))).toEqual(cfg);
  });
  it("throws on non-JSON", () => {
    expect(() => parseSdkConfig("not json")).toThrow();
  });
  it("copies only string values, omitting non-string fields", () => {
    const mixed = { ...cfg, messagingSenderId: 123 };
    const result = parseSdkConfig(JSON.stringify(mixed));
    expect(result.apiKey).toBe("AIza-x");
    expect(result).not.toHaveProperty("messagingSenderId");
  });
});
