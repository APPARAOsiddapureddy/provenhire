import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const apiHealthAlwaysOk = () => ({
  name: "api-health-always-ok",
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: () => void) => {
      if (req.url?.startsWith("/api/health")) {
        const target = process.env.VITE_API_PROXY_TARGET || "http://localhost:10000";
        fetch(`${target}/api/health`).catch(() => {}).finally(() => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        });
        return;
      }
      next();
    });
  },
});

// Set COOP so Firebase signInWithPopup can poll popup.closed (avoids "would block the window.closed call").
const coopHeader = () => ({
  name: "coop-header",
  configureServer(server: any) {
    const setCoop = (_req: any, res: any, next: () => void) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
      next();
    };
    // Prepend so the header is set before any handler sends the response (e.g. index.html).
    (server.middlewares as any).stack.unshift({ route: "", handle: setCoop });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/",
  server: {
    host: "::",
    port: 8080,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:10000",
        changeOrigin: true,
        secure: false,
        configure: (proxy: any) => {
          proxy.on("error", (_err: Error, _req: any, res: any) => {
            if (!res?.headersSent) {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Backend not running. Start with: npm run dev:all" }));
            }
          });
        },
      },
      "/uploads": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:10000",
        changeOrigin: true,
        secure: false,
      },
      "/health": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:10000",
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res: any) => {
            if (!res.headersSent) {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: true }));
            }
          });
        },
      },
      "/ping": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:10000",
        changeOrigin: true,
        secure: false,
      },
      "/diagnostic": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:10000",
        changeOrigin: true,
        secure: false,
      },
      "/socket.io": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:10000",
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
  plugins: [coopHeader(), apiHealthAlwaysOk(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-query"],
  },
}));
