import { fileURLToPath } from "node:url";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createLogger, defineConfig, type Plugin } from "vite";
import { resolvePurserEnv } from "@purser-sh/env";
import { checkUiHttp } from "@purser-sh/integrations/http-guard";
import { injectWindowBootstrap } from "@purser-sh/integrations/html-inject";
import { DEV_CONFIG_POLICY, handlePurserConfigRoute, readDevBootstrap } from "./src/lib/dev-config.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WEB_PORT = resolvePurserEnv().webPort;

function requestPath(url: string | undefined): string {
  return (url ?? "/").split("?")[0] ?? "/";
}

function isHtmlNavPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/index.html" || pathname === "/phone" || pathname === "/phone/";
}

function printPortInUse(port: number): void {
  console.error(
    [
      `Port ${port} is already in use.`,
      `Free it with: lsof -ti:${port} | xargs -r kill`,
      `Or start the web console elsewhere: PURSER_WEB_PORT=${port + 1} bun run --filter @purser-sh/web dev`,
    ].join("\n"),
  );
}

function purserConfigPlugin(mode: string, command: string): Plugin {
  let lastHtmlReq: IncomingMessage | undefined;
  return {
    name: "purser-config",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/phone" || req.url === "/phone/") {
          req.url = "/index.html";
        }
        if (isHtmlNavPath(requestPath(req.url))) {
          lastHtmlReq = req;
        }
        next();
      });
      server.middlewares.use("/__purser/config", (req, res) => {
        if (mode !== "development") {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "no-store");
          res.end(JSON.stringify({ error: "not found" }));
          return;
        }
        handlePurserConfigRoute({ mode, req, res, repoRoot });
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use("/__purser/config", (_req, res) => {
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "not found" }));
      });
    },
    transformIndexHtml(html) {
      if (command !== "serve" || mode !== "development") {
        return html;
      }
      const req = lastHtmlReq;
      if (req === undefined) {
        return html;
      }
      const decision = checkUiHttp({
        origin: req.headers.origin,
        host: req.headers.host,
        secFetchSite: req.headers["sec-fetch-site"],
        policy: DEV_CONFIG_POLICY,
      });
      if (!decision.ok) {
        return html;
      }
      const bootstrap = readDevBootstrap(repoRoot);
      if (bootstrap === undefined) {
        return html;
      }
      return injectWindowBootstrap(html, "__PURSER_BOOTSTRAP__", bootstrap);
    },
  };
}

function purserPortGuardPlugin(): Plugin {
  return {
    name: "purser-port-guard",
    configureServer(server) {
      server.httpServer?.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          printPortInUse(server.config.server.port ?? WEB_PORT);
          process.exit(1);
        }
      });
    },
  };
}

const viteLogger = createLogger();
const quietPortConflictLogger = {
  ...viteLogger,
  error(msg: string, options?: Parameters<typeof viteLogger.error>[1]) {
    if (/EADDRINUSE|already (?:in use|been used)/i.test(msg)) {
      printPortInUse(WEB_PORT);
      return;
    }
    viteLogger.error(msg, options);
  },
};

export default defineConfig(({ mode, command }) => ({
  plugins: [react(), tailwindcss(), purserConfigPlugin(mode, command), purserPortGuardPlugin()],
  customLogger: quietPortConflictLogger,
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src"),
      // tiktoken (via @anthropic-ai/tokenizer) pulls WASM that Vite cannot load.
      "@purser-sh/pricing": path.resolve(repoRoot, "packages/pricing/src/browser.ts"),
    },
  },
  server: {
    port: Number.isFinite(WEB_PORT) && WEB_PORT > 0 ? WEB_PORT : 7410,
    strictPort: true,
    cors: false,
    headers: {
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
    },
  },
}));
