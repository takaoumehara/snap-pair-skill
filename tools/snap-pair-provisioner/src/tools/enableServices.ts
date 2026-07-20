export interface EnableInput {
  projectId: string;
  databaseId?: string;
  location?: "us-central1" | "europe-west1" | "asia-southeast1";
}

export interface EnableDeps {
  getToken: () => Promise<string>;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const REQUIRED_APIS = ["identitytoolkit.googleapis.com", "firebasedatabase.googleapis.com"];

export async function enableSnapPairServices(input: EnableInput, deps: EnableDeps): Promise<string> {
  const fetchFn = deps.fetchFn ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const location = input.location ?? "us-central1";
  const databaseId = input.databaseId ?? `${input.projectId}-default-rtdb`;
  const log: string[] = [];
  const token = await deps.getToken();
  const authz = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Step 1: request enablement of required APIs (best-effort; ignore already-enabled).
  for (const api of REQUIRED_APIS) {
    try {
      await fetchFn(
        `https://serviceusage.googleapis.com/v1/projects/${input.projectId}/services/${api}:enable`,
        { method: "POST", headers: authz, body: "{}" }
      );
    } catch { /* best-effort; the PATCH/RTDB calls below surface real failures */ }
  }
  log.push("• 必要API有効化を要求");

  // Step 2: enable Anonymous Auth (retry with backoff to absorb API propagation).
  // NOTE: a brand-new project has no Identity Platform auth config, so the PATCH
  // returns 404 CONFIGURATION_NOT_FOUND. Creating that config programmatically
  // (initializeAuth) requires Blaze billing, so the free path is a one-time
  // "Authentication → Get started" click in the Firebase console. We surface that
  // as an actionable message rather than a raw 404. We do NOT early-return, so the
  // RTDB step below still runs.
  const patchUrl =
    `https://identitytoolkit.googleapis.com/v2/projects/${input.projectId}/config` +
    `?updateMask=signIn.anonymous.enabled`;
  let authOk = false;
  let lastStatus = 0;
  let lastBody = "";
  for (let attempt = 0; attempt < 3 && !authOk; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    const res = await fetchFn(patchUrl, {
      method: "PATCH",
      headers: authz,
      body: JSON.stringify({ signIn: { anonymous: { enabled: true } } }),
    });
    if (res.ok) authOk = true;
    else { lastStatus = res.status; lastBody = await res.text(); }
  }
  if (authOk) {
    log.push("✓ Anonymous Authentication 有効化");
  } else if (lastStatus === 404 || /CONFIGURATION_NOT_FOUND/.test(lastBody)) {
    log.push(
      "✗ Anonymous Authentication: このプロジェクトの認証が未初期化です。" +
      "Firebase Console → Authentication → 「始める」を一度クリック（無料）するか、" +
      "Blaze を有効化してから再実行してください。"
    );
  } else {
    log.push(`✗ Anonymous Authentication 有効化失敗 ${lastStatus}: ${lastBody}`);
  }

  // Step 3: create the DEFAULT RTDB instance via the Firebase Management API.
  // The CLI `database:instances:create` only creates *additional* instances and
  // fails on a project without a default DB; the Management API with
  // type=DEFAULT_DATABASE provisions the default instance for free on Spark.
  const rtdbUrl =
    `https://firebasedatabase.googleapis.com/v1beta/projects/${input.projectId}` +
    `/locations/${location}/instances?databaseId=${databaseId}`;
  const rres = await fetchFn(rtdbUrl, {
    method: "POST",
    headers: authz,
    body: JSON.stringify({ type: "DEFAULT_DATABASE" }),
  });
  if (rres.ok) {
    log.push(`✓ RTDB インスタンス作成: ${databaseId} (${location})`);
  } else {
    // Idempotency: an existing default DB returns 400 "Only one default database
    // is allowed." (not 409). Treat both as already-provisioned success.
    const rbody = await rres.text();
    if (rres.status === 409 || /already exists|only one default database/i.test(rbody)) {
      log.push(`• RTDB ${databaseId} は既存 (already exists)`);
    } else {
      log.push(`✗ RTDB作成失敗 ${rres.status}: ${rbody}`);
    }
  }

  return log.join("\n");
}
