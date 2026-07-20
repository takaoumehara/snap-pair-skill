import { describe, it, expect, vi } from "vitest";
import { getAccessToken } from "./firebaseToken.js";

const base = {
  activeAccounts: { "/": "me@example.com" },
  user: { email: "me@example.com" },
  tokens: { access_token: "CACHED", refresh_token: "R", expires_at: 0 },
};

describe("getAccessToken", () => {
  it("returns cached token when not expired", async () => {
    const cfg = { ...base, tokens: { ...base.tokens, expires_at: 10_000_000 } };
    const token = await getAccessToken({
      readConfig: () => JSON.stringify(cfg),
      now: () => 1000,
      fetchFn: (() => { throw new Error("should not fetch"); }) as any,
    });
    expect(token).toBe("CACHED");
  });

  it("refreshes when expired", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: "FRESH", expires_in: 3600 }),
    })) as any;
    const token = await getAccessToken({
      readConfig: () => JSON.stringify(base),
      now: () => 1_000_000,
      fetchFn,
    });
    expect(token).toBe("FRESH");
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("throws helpful error when no tokens present", async () => {
    await expect(
      getAccessToken({ readConfig: () => JSON.stringify({ activeAccounts: {} }), now: () => 0 })
    ).rejects.toThrow(/firebase login/);
  });

  it("throws an error with code NOT_LOGGED_IN when no tokens present", async () => {
    await expect(
      getAccessToken({ readConfig: () => JSON.stringify({ activeAccounts: {} }), now: () => 0 })
    ).rejects.toMatchObject({ code: "NOT_LOGGED_IN" });
  });

  it("rejects instead of falling back to primary tokens when active account is mismatched and unresolved", async () => {
    const cfg = {
      user: { email: "primary@x" },
      tokens: { access_token: "P", refresh_token: "R", expires_at: 10_000_000_000 },
      activeAccounts: { "/": "secondary@x" },
      additionalAccounts: [],
    };
    await expect(
      getAccessToken({
        readConfig: () => JSON.stringify(cfg),
        now: () => 1000,
        fetchFn: (() => { throw new Error("should not fetch"); }) as any,
      })
    ).rejects.toThrow(/firebase login/);
  });

  it("resolves active account from additionalAccounts instead of using primary tokens", async () => {
    const cfg = {
      user: { email: "primary@x" },
      tokens: { access_token: "P", refresh_token: "R", expires_at: 10_000_000_000 },
      activeAccounts: { "/": "secondary@x" },
      additionalAccounts: [
        {
          user: { email: "secondary@x" },
          tokens: { access_token: "S", refresh_token: "R2", expires_at: 10_000_000_000 },
        },
      ],
    };
    const token = await getAccessToken({
      readConfig: () => JSON.stringify(cfg),
      now: () => 1000,
      fetchFn: (() => { throw new Error("should not fetch"); }) as any,
    });
    expect(token).toBe("S");
  });

  it("honors the per-directory active account over the global default", async () => {
    const cfg = {
      user: { email: "primary@x" },
      tokens: { access_token: "P", refresh_token: "RP", expires_at: 10_000_000_000 },
      activeAccounts: { "/": "primary@x", "/work/proj": "secondary@x" },
      additionalAccounts: [
        {
          user: { email: "secondary@x" },
          tokens: { access_token: "S", refresh_token: "RS", expires_at: 10_000_000_000 },
        },
      ],
    };
    // cwd is inside /work/proj, so the per-directory account (secondary) must win
    // over the global default (primary) — otherwise we'd auth as the wrong account.
    const token = await getAccessToken({
      readConfig: () => JSON.stringify(cfg),
      now: () => 1000,
      cwd: () => "/work/proj/sub",
      fetchFn: (() => { throw new Error("should not fetch"); }) as any,
    });
    expect(token).toBe("S");
  });
});
