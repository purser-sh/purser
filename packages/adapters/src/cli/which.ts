import { spawnSync } from "node:child_process";

export function which(command: string): string | null {
  const result = spawnSync("sh", ["-c", `command -v ${JSON.stringify(command)}`], {
    encoding: "utf8",
  });
  const located = result.stdout.trim();
  return result.status === 0 && located.length > 0 ? located : null;
}
