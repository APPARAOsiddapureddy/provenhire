import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./src/app.js";

const app = createApp();
// Render sets PORT (default 10000). Fallback if missing/invalid to avoid ERR_SOCKET_BAD_PORT.
const raw = process.env.PORT;
const parsed = raw != null ? parseInt(String(raw), 10) : NaN;
const safePort = Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : 10000;

app.listen(safePort, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`ProvenHire API listening on ${safePort}`);
});
