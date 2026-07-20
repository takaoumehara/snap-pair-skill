import { parseSdkConfig, type SdkConfig } from "../sdkConfig.js";
import { mergeEnv } from "../envMerge.js";

export interface InjectInput {
  projectId: string;
  appId?: string;
  targetEnvPath: string;
  prefix?: string;
}

export interface InjectDeps {
  fb: (args: string[]) => Promise<string>;
  readFile: (p: string) => Promise<string>;
  writeFile: (p: string, c: string) => Promise<void>;
}

const SUFFIX: Record<keyof SdkConfig, string> = {
  apiKey: "API_KEY",
  authDomain: "AUTH_DOMAIN",
  databaseURL: "DATABASE_URL",
  projectId: "PROJECT_ID",
  storageBucket: "STORAGE_BUCKET",
  messagingSenderId: "MESSAGING_SENDER_ID",
  appId: "APP_ID",
};

export async function injectEnvVariables(input: InjectInput, deps: InjectDeps): Promise<string> {
  const prefix = input.prefix ?? "VITE_FIREBASE_";
  const args = [
    "apps:sdkconfig", "WEB",
    ...(input.appId ? [input.appId] : []),
    "--project", input.projectId, "--json",
  ];
  const cfg = parseSdkConfig(await deps.fb(args));

  const lines: string[] = [];
  for (const key of Object.keys(SUFFIX) as (keyof SdkConfig)[]) {
    const val = cfg[key];
    if (val) lines.push(`${prefix}${SUFFIX[key]}=${val}`);
  }

  let existing = "";
  try {
    existing = await deps.readFile(input.targetEnvPath);
  } catch {
    existing = "";
  }
  await deps.writeFile(input.targetEnvPath, mergeEnv(existing, lines));

  return (
    `✓ ${input.targetEnvPath} に ${lines.length} 変数を書き込み\n` +
    lines.join("\n") +
    `\n(注意: apiKey は公開前提だが、.env は .gitignore 対象にしておくこと)`
  );
}
