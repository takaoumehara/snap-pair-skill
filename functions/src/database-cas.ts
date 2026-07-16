export interface CasDependencies {
  request?: typeof fetch;
  accessToken?: () => Promise<string | undefined>;
  maxAttempts?: number;
}

export interface CasResult<T = unknown> {
  committed: boolean;
  value: T;
}

export function restJsonUrl(referenceUrl: string): string {
  const url = new URL(referenceUrl);
  url.pathname = `${url.pathname.replace(/\/$/, '')}.json`;
  if (process.env.FIREBASE_DATABASE_EMULATOR_HOST && process.env.GCLOUD_PROJECT) {
    url.searchParams.set('ns', process.env.GCLOUD_PROJECT);
  }
  return url.toString();
}

function isEmulatorUrl(url: string): boolean {
  const emulatorHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  return Boolean(emulatorHost) && new URL(url).host === emulatorHost;
}

/**
 * Optimistic compare-and-set using RTDB's server ETag. Every retry starts with
 * a fresh server read; no cached or previously read value is ever substituted.
 */
export async function compareAndSetJson<T = unknown>(
  url: string,
  update: (current: unknown) => T | undefined,
  dependencies: CasDependencies = {},
): Promise<CasResult<T | null>> {
  const request = dependencies.request ?? fetch;
  const token = isEmulatorUrl(url) ? 'owner' : await dependencies.accessToken?.();
  const authorization: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  const maxAttempts = dependencies.maxAttempts ?? 25;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const read = await request(url, {
      headers: { ...authorization, 'x-firebase-etag': 'true' },
    });
    if (!read.ok) throw new Error(`RTDB compare-and-set read failed (${read.status})`);
    const etag = read.headers.get('etag');
    if (!etag) throw new Error('RTDB compare-and-set read returned no ETag');
    const current = await read.json() as unknown;
    const next = update(current);
    if (next === undefined) return { committed: false, value: current as T | null };

    const write = await request(url, {
      method: 'PUT',
      headers: { ...authorization, 'content-type': 'application/json', 'if-match': etag },
      body: JSON.stringify(next),
    });
    if (write.status === 412) continue;
    if (!write.ok) throw new Error(`RTDB compare-and-set write failed (${write.status})`);
    return { committed: true, value: await write.json() as T };
  }
  throw new Error('RTDB compare-and-set exceeded retry limit');
}
