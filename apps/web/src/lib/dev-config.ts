import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkSameOriginHttp, CONFIG_ROUTE_HEADERS, type HttpGuardPolicy } from "@agentdeck/integrations";

export const DEV_CONFIG_POLICY: HttpGuardPolicy = {
  allowedOrigins: ["http://127.0.0.1:7410", "http://localhost:7410"],
  allowedHosts: ["127.0.0.1:7410", "localhost:7410"],
};

export function agentdeckConfigStatus(mode: string): 200 | 404 {
  return mode === "development" ? 200 : 404;
}

export type ConfigHttpRequest = {
  headers: {
    origin?: string | string[];
    host?: string | string[];
    "sec-fetch-site"?: string | string[];
  };
};

export type ConfigHttpResponse = {
  statusCode: number;
  setHeader(name: string, value: number | string | readonly string[]): unknown;
  end(chunk?: unknown): unknown;
};

export function handleAgentdeckConfigRoute(input: {
  mode: string;
  req: ConfigHttpRequest;
  res: ConfigHttpResponse;
  repoRoot: string;
  policy?: HttpGuardPolicy;
}): void {
  const { res } = input;
  if (agentdeckConfigStatus(input.mode) === 404) {
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", CONFIG_ROUTE_HEADERS["cache-control"]);
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  const decision = checkSameOriginHttp({
    origin: input.req.headers.origin,
    host: input.req.headers.host,
    secFetchSite: input.req.headers["sec-fetch-site"],
    policy: input.policy ?? DEV_CONFIG_POLICY,
  });
  if (!decision.ok) {
    res.statusCode = decision.status;
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", CONFIG_ROUTE_HEADERS["cache-control"]);
    res.end(JSON.stringify({ error: decision.reason }));
    return;
  }

  const configFile = path.join(os.homedir(), ".agentdeck", "config.json");
  try {
    const raw = readFileSync(configFile, "utf8");
    const parsed: unknown = JSON.parse(raw);
    const token = isRecord(parsed) && typeof parsed.token === "string" ? parsed.token : "";
    const port = isRecord(parsed) && typeof parsed.port === "number" ? parsed.port : 7420;
    const allowedRoots =
      isRecord(parsed) && Array.isArray(parsed.allowedRoots)
        ? parsed.allowedRoots.filter((item): item is string => typeof item === "string")
        : [];
    const defaultWorkspace = existsSync(path.join(input.repoRoot, "package.json"))
      ? { name: path.basename(input.repoRoot), absPath: input.repoRoot }
      : undefined;
    res.statusCode = 200;
    for (const [header, value] of Object.entries(CONFIG_ROUTE_HEADERS)) {
      res.setHeader(header, value);
    }
    res.end(
      JSON.stringify({
        wsUrl: `ws://127.0.0.1:${port}`,
        token,
        allowedRoots,
        defaultWorkspace,
      }),
    );
  } catch {
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "runner config not found" }));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
