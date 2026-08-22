import { readFileSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function agentdeckConfigPlugin(): Plugin {
  return {
    name: "agentdeck-config",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/phone" || req.url === "/phone/") {
          req.url = "/index.html";
        }
        next();
      });
      server.middlewares.use("/__agentdeck/config", (_req, res) => {
        const configFile = path.join(os.homedir(), ".agentdeck", "config.json");
        try {
          const raw = readFileSync(configFile, "utf8");
          const parsed = JSON.parse(raw) as { token?: string; port?: number; allowedRoots?: string[] };
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              wsUrl: `ws://127.0.0.1:${parsed.port ?? 7420}`,
              token: parsed.token ?? "",
              allowedRoots: parsed.allowedRoots ?? [],
            }),
          );
        } catch {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "runner config not found" }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), agentdeckConfigPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
