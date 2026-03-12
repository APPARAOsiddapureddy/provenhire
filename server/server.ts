import http from "http";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

import { createApp } from "./src/app.js";
import { initProctorSocket } from "./src/socket/proctor-socket.js";
import { ensureDefaultFlags } from "./src/services/featureFlag.service.js";

const app = createApp();
const httpServer = http.createServer(app);

initProctorSocket(httpServer);

// Ensure feature flags exist on startup (idempotent)
ensureDefaultFlags().catch((e) => {
  console.warn("[feature-flags] Could not ensure default flags:", e?.message);
});

// Render sets PORT (default 10000). Fallback if missing/invalid to avoid ERR_SOCKET_BAD_PORT.
const raw = process.env.PORT;
const parsed = raw != null ? parseInt(String(raw), 10) : NaN;
const safePort = Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : 10000;

httpServer.listen(safePort, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`ProvenHire API listening on ${safePort} (HTTP + Socket.io)`);
});
