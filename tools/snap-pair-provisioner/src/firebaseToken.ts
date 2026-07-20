import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_PATH = join(homedir(), ".config", "configstore", "firebase-tools.json");
const TOKEN_URL = "https://oauth2.googleapis.com/token";
// Public installed-app OAuth client shipped in firebase-tools.
const CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";

export interface TokenDeps {
  readConfig?: () => string;
  now?: () => number;
  fetchFn?: typeof fetch;
  cwd?: () => string;
}

interface StoredTokens {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

/** Resolve the active account email the way firebase-tools does: the longest
 *  activeAccounts directory key that is a prefix of cwd wins, else the global
 *  default at "/". This mirrors `firebase login:use`, which sets a per-project
 *  directory account that must take precedence over the global default. */
function resolveActiveEmail(cfg: any, cwd: string): string | undefined {
  const map = cfg?.activeAccounts;
  if (!map || typeof map !== "object") return undefined;
  let best: string | undefined;
  let bestLen = -1;
  for (const key of Object.keys(map)) {
    if (key === "/") continue;
    const prefix = key.endsWith("/") ? key : key + "/";
    if (cwd === key || cwd.startsWith(prefix)) {
      if (key.length > bestLen) {
        best = map[key];
        bestLen = key.length;
      }
    }
  }
  return best ?? map["/"];
}

function selectTokens(cfg: any, active: string | undefined): StoredTokens | undefined {
  if (!active) {
    return cfg?.tokens?.refresh_token || cfg?.tokens?.access_token ? cfg.tokens : undefined;
  }
  if (cfg?.user?.email === active && cfg?.tokens) return cfg.tokens;
  const extra = cfg?.additionalAccounts;
  if (Array.isArray(extra)) {
    const m = extra.find((a: any) => a?.user?.email === active);
    if (m?.tokens) return m.tokens;
  } else if (extra && typeof extra === "object") {
    for (const a of Object.values<any>(extra)) {
      if (a?.user?.email === active && a?.tokens) return a.tokens;
    }
  }
  return undefined;
}

const NEED_LOGIN =
  "Firebase の認証情報が見つからない/期限切れです。`firebase login`（または `firebase login --reauth`）を実行してください。";

function needLogin(): Error {
  const e: any = new Error(NEED_LOGIN);
  e.code = "NOT_LOGGED_IN";
  return e;
}

export async function getAccessToken(deps: TokenDeps = {}): Promise<string> {
  const readConfig = deps.readConfig ?? (() => readFileSync(CONFIG_PATH, "utf8"));
  const now = deps.now ?? Date.now;
  const fetchFn = deps.fetchFn ?? fetch;
  const cwd = (deps.cwd ?? (() => process.cwd()))();

  let cfg: any;
  try {
    cfg = JSON.parse(readConfig());
  } catch {
    throw needLogin();
  }
  const active = resolveActiveEmail(cfg, cwd);
  const tokens = selectTokens(cfg, active);
  if (!tokens?.refresh_token && !tokens?.access_token) throw needLogin();

  if (tokens.access_token && (tokens.expires_at ?? 0) > now() + 60_000) {
    return tokens.access_token;
  }
  if (!tokens.refresh_token) throw needLogin();

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: tokens.refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw needLogin();
  const json: any = await res.json();
  if (!json?.access_token) throw needLogin();
  return json.access_token as string;
}
