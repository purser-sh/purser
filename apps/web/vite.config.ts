import { fileURLToPath } from "node:url";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { handleAgentdeckConfigRoute } from "./src/lib/dev-config.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function agentdeckConfigPlugin(mode: string): Plugin {
  return {
    name: "agentdeck-config",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/phone" || req.url === "/phone/") {
          req.url = "/index.html";
        }
        next();
      });
      server.middlewares.use("/__agentdeck/config", (req, res) => {
        if (mode !== "development") {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "no-store");
          res.end(JSON.stringify({ error: "not found" }));
          return;
        }
        handleAgentdeckConfigRoute({ mode, req, res, repoRoot });
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use("/__agentdeck/config", (_req, res) => {
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "not found" }));
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), agentdeckConfigPlugin(mode)],
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src"),
    },
  },
  server: {
    port: 7410,
    strictPort: true,
  },
}));
