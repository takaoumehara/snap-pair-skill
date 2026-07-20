import { describe, it, expect, vi } from "vitest";
import { enableSnapPairServices } from "./enableServices.js";

const okRes = { ok: true, status: 200, text: async () => "", json: async () => ({}) };

/** Build a fetch stub that routes by (url, opts) to the first matching handler. */
function makeFetch(handlers: Array<{ match: (u: any, o: any) => boolean; res: () => any }>) {
  return vi.fn(async (u: any, o: any) => {
    for (const h of handlers) if (h.match(u, o)) return h.res();
    return okRes;
  }) as any;
}

const isPatch = (_u: any, o: any) => o?.method === "PATCH";
// Match the RTDB Management API host specifically — note the serviceusage
// enable URL also contains the string "firebasedatabase.googleapis.com".
const isRtdb = (u: any) => String(u).startsWith("https://firebasedatabase.googleapis.com/");

describe("enableSnapPairServices", () => {
  it("enables auth and creates the default RTDB via the Management API", async () => {
    const fetchFn = makeFetch([
      { match: isPatch, res: () => okRes },
      { match: isRtdb, res: () => okRes },
    ]);
    const summary = await enableSnapPairServices(
      { projectId: "p", location: "us-central1" },
      { getToken: async () => "T", fetchFn, sleep: async () => {} }
    );
    expect(summary).toMatch(/✓ Anonymous Authentication/);
    expect(summary).toMatch(/✓ RTDB/);
    // RTDB created via the firebasedatabase Management API with type DEFAULT_DATABASE
    const rtdbCall = fetchFn.mock.calls.find(([u]: any[]) => isRtdb(u));
    expect(rtdbCall).toBeTruthy();
    expect(String(rtdbCall[0])).toContain("databaseId=p-default-rtdb");
    expect(String(rtdbCall[0])).toContain("/locations/us-central1/instances");
    expect(rtdbCall[1].body).toContain("DEFAULT_DATABASE");
  });

  it("treats an existing default RTDB (400 'Only one default database') as idempotent success", async () => {
    // This is the real response an already-provisioned default DB returns — NOT 409.
    const fetchFn = makeFetch([
      { match: isPatch, res: () => okRes },
      { match: isRtdb, res: () => ({
        ok: false, status: 400,
        text: async () => JSON.stringify({ error: { code: 400, message: "Only one default database is allowed.", status: "FAILED_PRECONDITION" } }),
        json: async () => ({}),
      }) },
    ]);
    const summary = await enableSnapPairServices(
      { projectId: "p" },
      { getToken: async () => "T", fetchFn, sleep: async () => {} }
    );
    expect(summary).toMatch(/既存|already/i);
    expect(summary).not.toMatch(/✗/);
  });

  it("also treats an RTDB 409 as idempotent success", async () => {
    const fetchFn = makeFetch([
      { match: isPatch, res: () => okRes },
      { match: isRtdb, res: () => ({ ok: false, status: 409, text: async () => "Database already exists", json: async () => ({}) }) },
    ]);
    const summary = await enableSnapPairServices(
      { projectId: "p" },
      { getToken: async () => "T", fetchFn, sleep: async () => {} }
    );
    expect(summary).toMatch(/既存|already/i);
    expect(summary).not.toMatch(/✗/);
  });

  it("retries the anonymous-auth PATCH then succeeds", async () => {
    let n = 0;
    const fetchFn = vi.fn(async (_u: any, o: any) => {
      if (o?.method === "PATCH") {
        n++;
        return n < 2
          ? { ok: false, status: 503, text: async () => "propagating", json: async () => ({}) }
          : okRes;
      }
      return okRes; // serviceusage + rtdb
    }) as any;
    const summary = await enableSnapPairServices(
      { projectId: "p" },
      { getToken: async () => "T", fetchFn, sleep: async () => {} }
    );
    expect(n).toBe(2);
    expect(summary).toMatch(/✓ Anonymous Authentication/);
  });

  it("returns an actionable message when the auth config is not initialized (404), and still attempts RTDB", async () => {
    const fetchFn = makeFetch([
      { match: isPatch, res: () => ({
        ok: false, status: 404,
        text: async () => JSON.stringify({ error: { status: "NOT_FOUND", message: "CONFIGURATION_NOT_FOUND" } }),
        json: async () => ({}),
      }) },
      { match: isRtdb, res: () => okRes },
    ]);
    const summary = await enableSnapPairServices(
      { projectId: "p" },
      { getToken: async () => "T", fetchFn, sleep: async () => {} }
    );
    expect(summary).toMatch(/✗ Anonymous Authentication/);
    expect(summary).toMatch(/始める|初期化|Blaze/);
    // RTDB is still attempted (and succeeds) despite the auth-config gap
    expect(summary).toMatch(/✓ RTDB/);
  });
});
