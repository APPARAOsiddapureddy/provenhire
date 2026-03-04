import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./src/app.js";

const app = createApp();
const port = Number(process.env.PORT || 5000);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`ProvenHire API listening on ${port}`);
});
