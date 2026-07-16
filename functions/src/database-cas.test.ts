import { describe, expect, it, vi } from 'vitest';
import { compareAndSetJson, restJsonUrl } from './database-cas.js';

describe('compareAndSetJson', () => {
  it('targets the active project namespace when Admin reference URLs point at the emulator', () => {
    vi.stubEnv('FIREBASE_DATABASE_EMULATOR_HOST', '127.0.0.1:9000');
    vi.stubEnv('GCLOUD_PROJECT', 'demo-safe');
    expect(restJsonUrl('http://127.0.0.1:9000/rooms/r')).toBe('http://127.0.0.1:9000/rooms/r.json?ns=demo-safe');
    vi.unstubAllEnvs();
  });

  it('uses the Emulator owner token without requesting production credentials', async () => {
    vi.stubEnv('FIREBASE_DATABASE_EMULATOR_HOST', '127.0.0.1:9000');
    const request = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer owner',
        'x-firebase-etag': 'true',
      });
      return new Response('null', { status: 200, headers: { etag: 'one' } });
    });
    const accessToken = vi.fn(async () => {
      throw new Error('production credentials must not be requested for the Emulator');
    });

    const result = await compareAndSetJson(
      'http://127.0.0.1:9000/rooms/r.json?ns=demo-safe',
      () => undefined,
      { request, accessToken },
    );

    expect(result).toEqual({ committed: false, value: null });
    expect(accessToken).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('does not send the Emulator owner token to a production URL', async () => {
    vi.stubEnv('FIREBASE_DATABASE_EMULATOR_HOST', '127.0.0.1:9000');
    const request = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer production-token',
        'x-firebase-etag': 'true',
      });
      return new Response('null', { status: 200, headers: { etag: 'one' } });
    });
    const accessToken = vi.fn(async () => 'production-token');

    await compareAndSetJson(
      'https://demo-safe-default-rtdb.firebaseio.com/rooms/r.json',
      () => undefined,
      { request, accessToken },
    );

    expect(accessToken).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });

  it('never revives a value deleted between read and conditional write', async () => {
    const responses = [
      new Response(JSON.stringify({ alive: true }), { status: 200, headers: { etag: 'one' } }),
      new Response(null, { status: 412 }),
      new Response('null', { status: 200, headers: { etag: 'two' } }),
    ];
    const request = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => responses.shift()!);
    const result = await compareAndSetJson(
      'http://127.0.0.1:9000/rooms/r.json?ns=test',
      (current) => current === null ? undefined : { ...(current as object), changed: true },
      { request, accessToken: async () => undefined },
    );

    expect(result).toEqual({ committed: false, value: null });
    expect(request).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({ alive: true, changed: true });
  });

  it('recomputes from the latest server value after an etag conflict', async () => {
    const responses = [
      new Response(JSON.stringify({ count: 1 }), { status: 200, headers: { etag: 'one' } }),
      new Response(null, { status: 412 }),
      new Response(JSON.stringify({ count: 2 }), { status: 200, headers: { etag: 'two' } }),
      new Response(JSON.stringify({ count: 3 }), { status: 200 }),
    ];
    const request = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => responses.shift()!);
    const result = await compareAndSetJson(
      'http://127.0.0.1:9000/counter.json?ns=test',
      (current) => ({ count: Number((current as any).count) + 1 }),
      { request, accessToken: async () => undefined },
    );

    expect(result).toEqual({ committed: true, value: { count: 3 } });
    expect(JSON.parse(String(request.mock.calls[3]?.[1]?.body))).toEqual({ count: 3 });
  });
});
