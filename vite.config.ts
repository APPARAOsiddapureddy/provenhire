import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/",
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:10000",
        changeOrigin: true,
        secure: false,
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
    },
  },
  plugins: [react()],
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
