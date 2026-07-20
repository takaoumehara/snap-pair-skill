import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);

export type ExecFn = (
  cmd: string,
  args: string[],
  opts: { cwd?: string; maxBuffer?: number }
) => Promise<{ stdout: string; stderr?: string }>;

const AUTH_RE = /not logged in|not authorized|failed to authenticate|authentication error|command requires authentication|run `?firebase login`?|have you run `?firebase login`?/i;

export function makeFb(exec: ExecFn = pexec as unknown as ExecFn) {
  return async function fb(args: string[], cwd?: string): Promise<string> {
    try {
      const { stdout } = await exec("firebase", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
      return stdout;
    } catch (e: any) {
      const msg = (e.stderr || e.stdout || e.message || "").toString();
      if (AUTH_RE.test(msg)) {
        const err: any = new Error("NOT_LOGGED_IN: " + msg);
        err.code = "NOT_LOGGED_IN";
        throw err;
      }
      throw new Error("`firebase " + args.join(" ") + "` failed:\n" + msg);
    }
  };
}
