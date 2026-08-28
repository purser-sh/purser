import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, relative, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolvePurserEnv } from "@purser-sh/env";
import { checkUiHttp, CONFIG_ROUTE_HEADERS, injectWindowBootstrap, type HttpGuardPolicy } from "@purser-sh/integrations";
import { EMBEDDED_UI } from "./embedded-ui.gen.ts";

export type UiBootstrap = {
  wsUrl: string;
  token: string;
  allowedRoots: string[];
};

const HTML_HEADERS = {
  "cache-control": "no-store",
  vary: "Origin",
  "x-content-type-options": "nosniff",
  "content-type": "text/html; charset=utf-8",
} as const;

export function injectBootstrap(html: string, bootstrap: UiBootstrap): string {
  return injectWindowBootstrap(html, "__PURSER_BOOTSTRAP__", bootstrap);
}

/** Map a request path to a file under the UI root. `/` and `/phone` serve index.html. */
export function resolveUiRelPath(urlPath: string): string | undefined {
  let pathname = urlPath.split("?")[0] ?? "/";
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (pathname === "/" || pathname === "/index.html" || pathname === "/phone" || pathname === "/phone/") {
    return "index.html";
  }
  if (!pathname.startsWith("/")) {
    return undefined;
  }
  const rel = pathname.slice(1);
  if (rel.length === 0 || rel.split("/").includes("..") || rel.includes("\0")) {
    return undefined;
  }
  return rel;
}

export function contentTypeFor(relPath: string): string {
  const ext = extname(relPath).toLowerCase();
  if (ext === ".html") {
    return "text/html; charset=utf-8";
  }
  if (ext === ".js" || ext === ".mjs") {
    return "text/javascript; charset=utf-8";
  }
  if (ext === ".css") {
    return "text/css; charset=utf-8";
  }
  if (ext === ".svg") {
    return "image/svg+xml";
  }
  if (ext === ".json") {
    return "application/json";
  }
  if (ext === ".woff2") {
    return "font/woff2";
  }
  if (ext === ".woff") {
    return "font/woff";
  }
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".ico") {
    return "image/x-icon";
  }
  if (ext === ".map") {
    return "application/json";
  }
  return "application/octet-stream";
}

export function resolveUiFile(uiDir: string, relPath: string): string | undefined {
  const root = resolve(uiDir);
  const abs = resolve(root, relPath);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || rel.split(sep).includes("..") || normalize(rel) !== rel) {
    return undefined;
  }
  if (!existsSync(abs)) {
    return undefined;
  }
  const stat = statSync(abs);
  if (!stat.isFile()) {
    return undefined;
  }
  return abs;
}

export function writeConfigRouteGone(res: ServerResponse): void {
  res.statusCode = 404;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", CONFIG_ROUTE_HEADERS["cache-control"]);
  res.setHeader("x-content-type-options", CONFIG_ROUTE_HEADERS["x-content-type-options"]);
  res.end(JSON.stringify({ error: "not found" }));
}

export function hasEmbeddedUi(): boolean {
  return EMBEDDED_UI.length > 0;
}

function readUiBytes(rel: string, uiDir: string | undefined): Buffer | undefined {
  const embedded = EMBEDDED_UI.find((file) => file.path === rel);
  if (embedded !== undefined) {
    return Buffer.from(embedded.bodyBase64, "base64");
  }
  if (uiDir === undefined) {
    return undefined;
  }
  const file = resolveUiFile(uiDir, rel);
  if (file === undefined) {
    return undefined;
  }
  return readFileSync(file);
}

export function serveEmbeddedUi(input: {
  req: IncomingMessage;
  res: ServerResponse;
  uiDir: string | undefined;
  bootstrap: UiBootstrap;
  policy: HttpGuardPolicy;
}): boolean {
  const urlPath = input.req.url ?? "/";
  const rel = resolveUiRelPath(urlPath);
  if (rel === undefined) {
    return false;
  }
  const decision = checkUiHttp({
    origin: input.req.headers.origin,
    host: input.req.headers.host,
    secFetchSite: input.req.headers["sec-fetch-site"],
    policy: input.policy,
  });
  if (!decision.ok) {
    input.res.statusCode = decision.status;
    input.res.setHeader("content-type", "application/json");
    input.res.setHeader("cache-control", "no-store");
    input.res.end(JSON.stringify({ error: decision.reason }));
    return true;
  }
  const raw = readUiBytes(rel, input.uiDir);
  if (raw === undefined) {
    return false;
  }
  if (rel === "index.html") {
    const html = injectBootstrap(raw.toString("utf8"), input.bootstrap);
    input.res.statusCode = 200;
    for (const [name, value] of Object.entries(HTML_HEADERS)) {
      input.res.setHeader(name, value);
    }
    input.res.end(html);
    return true;
  }
  const embedded = EMBEDDED_UI.find((file) => file.path === rel);
  input.res.statusCode = 200;
  input.res.setHeader("content-type", embedded?.contentType ?? contentTypeFor(rel));
  input.res.setHeader("x-content-type-options", "nosniff");
  input.res.setHeader("cache-control", "public, max-age=31536000, immutable");
  input.res.end(raw);
  return true;
}

export function resolveUiDir(metaDir: string): string | undefined {
  const override = resolvePurserEnv().uiDir;
  if (override !== undefined && override.length > 0) {
    return existsSync(join(override, "index.html")) ? override : undefined;
  }
  const packaged = typeof Bun !== "undefined" && Bun.isStandaloneExecutable === true;
  if (!packaged) {
    return undefined;
  }
  const candidates = [join(metaDir, "ui"), join(metaDir, "..", "ui")];
  for (const dir of candidates) {
    if (existsSync(join(dir, "index.html"))) {
      return dir;
    }
  }
  return undefined;
}
