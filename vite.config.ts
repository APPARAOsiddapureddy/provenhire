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

const COOP_VALUE = "same-origin-allow-popups";

// Force COOP on every response so Firebase signInWithPopup can use window.closed (avoids COOP warning).
// Patch res so COOP is always set before any response is sent (writeHead/end).
const coopHeader = () => ({
  name: "coop-header",
  configureServer(server: any) {
    const handle: any = (req: any, res: any, next: () => void) => {
      if (res._coopPatched) {
        next();
        return;
      }
      const rawSetHeader = res.setHeader.bind(res);
      const setCoop = () => {
        try {
          rawSetHeader("Cross-Origin-Opener-Policy", COOP_VALUE);
        } catch (_) {}
      };
      res.setHeader = function (name: string, value: string | number | string[]) {
        const out = rawSetHeader(name, value);
        setCoop();
        return out;
      };
      const rawWriteHead = res.writeHead.bind(res);
      res.writeHead = function (this: any, statusCode: number, ...args: any[]) {
        setCoop();
        return rawWriteHead.apply(this, [statusCode, ...args]);
      };
      const rawEnd = res.end.bind(res);
      res.end = function (this: any, ...args: any[]) {
        setCoop();
        return rawEnd.apply(this, args);
      };
      res._coopPatched = true;
      setCoop();
      next();
    };
    (server.middlewares as any).stack.unshift({ route: "", handle });
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
