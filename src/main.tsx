import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./dashboard.css";

// Suppress unhandled promise rejections from third-party scripts (e.g. Give Freely browser extension)
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const msg = (event.reason?.message ?? String(event.reason ?? "")).slice(0, 200);
    const stack = event.reason?.stack ?? "";
    const isGiveFreelyPayload =
      typeof msg === "string" &&
      (msg.includes("payload") || msg.includes("reading 'payload'")) &&
      (stack.includes("giveFreely") || /giveFreely\.tsx/.test(stack));
    if (isGiveFreelyPayload) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

// If a stale service worker is controlling the site (from an older deployment),
// it can break asset loads during domain/canonical changes. Force-unregister so
// the app always boots cleanly on the canonical origin.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then(async (regs) => {
      await Promise.allSettled(regs.map((r) => r.unregister()));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.allSettled(keys.map((k) => caches.delete(k)));
      }
    })
    .catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);