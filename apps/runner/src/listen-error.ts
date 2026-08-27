/**
 * Friendly listen errors. Never show a Node emitError stack for a port conflict.
 */
export function formatListenError(error: unknown, port: number): string {
  const code =
    error !== null && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "EADDRINUSE") {
    return [
      `Port ${port} is already in use.`,
      `Free it with: lsof -ti:${port} | xargs -r kill`,
      `Or start Purser on another port: PURSER_PORT=${port + 1} bun run --filter @purser-sh/runner start`,
    ].join("\n");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function isAddressInUse(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && (error as { code: unknown }).code === "EADDRINUSE";
}
