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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);