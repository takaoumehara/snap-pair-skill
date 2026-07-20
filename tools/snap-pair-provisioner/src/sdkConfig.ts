export interface SdkConfig {
  apiKey?: string;
  authDomain?: string;
  databaseURL?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

const KEYS: (keyof SdkConfig)[] = [
  "apiKey", "authDomain", "databaseURL", "projectId",
  "storageBucket", "messagingSenderId", "appId",
];

/** Parse `firebase apps:sdkconfig WEB --json` output into a flat SdkConfig.
 *  Accepts {result:{sdkConfig}}, {sdkConfig}, or a flat config object. */
export function parseSdkConfig(raw: string): SdkConfig {
  const parsed = JSON.parse(raw);
  const cfg = parsed?.result?.sdkConfig ?? parsed?.sdkConfig ?? parsed;
  const out: SdkConfig = {};
  for (const k of KEYS) {
    if (typeof cfg?.[k] === "string") out[k] = cfg[k];
  }
  return out;
}
