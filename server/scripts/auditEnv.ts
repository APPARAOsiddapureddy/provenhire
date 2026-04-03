import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

config({ path: resolve(fileURLToPath(new URL(".", import.meta.url)), "../.env") });
