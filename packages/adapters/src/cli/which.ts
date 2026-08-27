import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const SHELL = existsSync("/bin/sh") ? "/bin/sh" : "sh";

/**
 * Looks a command up on PATH. The shell is addressed absolutely and the
 * environment is passed explicitly so a test can hand in an empty PATH and get
 * a genuine "not installed", not a shell that failed to launch.
 */
export function which(command: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const result = spawnSync(SHELL, ["-c", `command -v ${JSON.stringify(command)}`], {
    encoding: "utf8",
    env: { PATH: env.PATH ?? "", HOME: env.HOME ?? "" },
  });
  const located = result.stdout?.trim() ?? "";
  return result.status === 0 && located.length > 0 ? located : null;
}

/**
 * Resolve a binary on PATH, then via a login shell when the current process
 * inherited a stripped PATH (common for GUI-launched runners).
 */
export function locateBinary(command: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const direct = which(command, env);
  if (direct !== null) {
    return direct;
  }
  if (env !== process.env) {
    return null;
  }
  const shell = which("bash", env) ?? which("sh", env);
  if (shell === null) {
    return null;
  }
  const result = spawnSync(shell, ["-lc", `command -v ${JSON.stringify(command)}`], {
    encoding: "utf8",
    env,
  });
  const located = result.stdout?.trim() ?? "";
  return result.status === 0 && located.length > 0 ? located : null;
}
