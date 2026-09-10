import { defineConfig, loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";

function attachApi(server: ViteDevServer | PreviewServer, env: Record<string, string>) {
  return Promise.all([import("./server/vision.mjs"), import("./server/store.mjs")])
    .then(([{ handleAnalyze, handleStatus }, { handleApi }]) => {
      server.middlewares.use("/api/status", (req, res) => handleStatus(req, res, env));
      server.middlewares.use("/api/analyze", (req, res) => handleAnalyze(req, res, env));
      server.middlewares.use((req, res, next) => {
        handleApi(req, res, env).then((hit: boolean) => {
          if (!hit) next();
        });
      });
    })
    .catch((err) => {
      console.error("[api] SQLite/API failed to start:", err);
      throw err;
    });
}

function analyzeApi(env: Record<string, string>): Plugin {
  return {
    name: "analystradeai-analyze",
    configureServer(server) {
      return attachApi(server, env);
    },
    configurePreviewServer(server) {
      return attachApi(server, env);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), analyzeApi(env)],
    base: "./",
    server: { port: 5173, host: "127.0.0.1", strictPort: true },
    preview: { port: 4173, host: "127.0.0.1" },
    optimizeDeps: { exclude: ["better-sqlite3"] },
  };
});
