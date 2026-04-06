import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/** In dev only: replace Vite proxy connection errors with one friendly line. Production does not use Vite proxy. */
const quietProxyErrors = () => {
  const originalError = console.error;
  let lastLog = 0;
  return {
    name: "quiet-proxy-errors",
    configureServer() {
      console.error = (...args: unknown[]) => {
        const msg = args[0] != null ? String(args[0]) : "";
        const isViteProxyError = msg.includes("http proxy error");
        if (isViteProxyError) {
          const now = Date.now();
          if (now - lastLog > 15000) {
            lastLog = now;
            originalError.call(console, "[vite] Backend unreachable. From the project root run: npm run dev (starts both frontend and backend).");
          }
          return;
        }
        originalError.apply(console, args);
      };
    },
  };
};

// Handle /api/health BEFORE the proxy so we always return 503 when backend is down (proxy would
// do the same, but this ensures one place and correct body). Run first via unshift.
const BACKEND_DOWN_MSG = "Backend isn't running. From the project root run: npm run dev (starts both frontend and backend).";
const apiHealthProxy = () => ({
  name: "api-health-proxy",
  configureServer(server: any) {
    const handle = (req: any, res: any, next: () => void) => {
      const url = req.url?.split("?")[0] ?? "";
      if (url === "/api/health") {
        const target = process.env.VITE_API_PROXY_TARGET || "http://localhost:10000";
        const ac = new AbortController();
        const timeoutId = setTimeout(() => ac.abort(), 5000);
        const done = () => {
          clearTimeout(timeoutId);
        };
        fetch(`${target}/api/health`, { signal: ac.signal })
          .then((r) => {
            done();
            if (r.ok) {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: true }));
            } else {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: BACKEND_DOWN_MSG }));
            }
          })
          .catch(() => {
            done();
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: BACKEND_DOWN_MSG }));
          });
        return;
      }
      next();
    };
    (server.middlewares as any).stack.unshift({ route: "", handle });
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
              res.end(JSON.stringify({ error: BACKEND_DOWN_MSG }));
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
        configure: (proxy: any) => {
          proxy.on("error", (_err: Error, _req: any, res: any) => {
            if (!res?.headersSent) {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: BACKEND_DOWN_MSG }));
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
  plugins: [quietProxyErrors(), coopHeader(), apiHealthProxy(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "ui-vendor": [
            "@radix-ui/react-accordion",
            "@radix-ui/react-alert-dialog",
            "@radix-ui/react-aspect-ratio",
            "@radix-ui/react-avatar",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-collapsible",
            "@radix-ui/react-context-menu",
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-hover-card",
            "@radix-ui/react-label",
            "@radix-ui/react-menubar",
            "@radix-ui/react-navigation-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-progress",
            "@radix-ui/react-radio-group",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-select",
            "@radix-ui/react-separator",
            "@radix-ui/react-slider",
            "@radix-ui/react-slot",
            "@radix-ui/react-switch",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-toggle",
            "@radix-ui/react-toggle-group",
            "@radix-ui/react-tooltip",
          ],
          "query-vendor": ["@tanstack/react-query"],
          "editor-vendor": ["@monaco-editor/react"],
          "chart-vendor": ["recharts"],
          "pdf-vendor": ["pdfjs-dist"],
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-query"],
  },
}));
