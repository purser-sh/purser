import { spawnSync } from "node:child_process";
import { which } from "../cli/which.ts";

export type MarkItDownStatus =
  | { available: true; command: string[] }
  | { available: false; installCommand: string; detail: string };

const INSTALL = "pip install 'markitdown[all]'";

export function markitdownStatus(): MarkItDownStatus {
  const direct = which("markitdown");
  if (direct !== null) {
    return { available: true, command: [direct] };
  }
  const python3 = which("python3");
  if (python3 !== null) {
    const probe = spawnSync(python3, ["-m", "markitdown", "--help"], { encoding: "utf8", timeout: 3000 });
    if (probe.status === 0 || probe.stdout.includes("markitdown")) {
      return { available: true, command: [python3, "-m", "markitdown"] };
    }
  }
  const python = which("python");
  if (python !== null) {
    const probe = spawnSync(python, ["-m", "markitdown", "--help"], { encoding: "utf8", timeout: 3000 });
    if (probe.status === 0 || probe.stdout.includes("markitdown")) {
      return { available: true, command: [python, "-m", "markitdown"] };
    }
  }
  return {
    available: false,
    installCommand: INSTALL,
    detail: "MarkItDown is not installed. It unlocks PowerPoint, images with OCR, and other formats.",
  };
}

export function convertWithMarkitdown(absPath: string, timeoutMs: number): { ok: true; markdown: string } | { ok: false; message: string } {
  const status = markitdownStatus();
  if (!status.available) {
    return {
      ok: false,
      message: `${status.detail} Install: ${status.installCommand}`,
    };
  }
  const args = [...status.command, absPath];
  const result = spawnSync(args[0]!, args.slice(1), {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    return { ok: false, message: `MarkItDown failed: ${result.error.message}` };
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || `exit ${result.status}`).trim();
    return { ok: false, message: `MarkItDown exited with an error: ${detail}` };
  }
  const markdown = (result.stdout ?? "").trim();
  if (markdown.length === 0) {
    return { ok: false, message: "MarkItDown returned no content." };
  }
  return { ok: true, markdown };
}
