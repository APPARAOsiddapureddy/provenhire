import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const destination = path.join(serverRoot, "dist", "src", "data");

const files = [
  "aptitude-questions.json",
  "cs-fundamentals-questions.json",
  "data-fundamentals-questions.json",
  "non-tech-domain-questions.json",
];

await mkdir(destination, { recursive: true });

await Promise.all(
  files.map((file) =>
    copyFile(path.join(serverRoot, "src", "data", file), path.join(destination, file)),
  ),
);
