import fs from "node:fs/promises";

import { callReportGenerationChain } from "../dist/src/services/assessmentReportAgent.service.js";

const files = (await fs.readdir("/tmp"))
  .filter((name) => name.startsWith("provenhire_report_model_calibration_") && name.endsWith(".json"))
  .sort();
if (!files.length) throw new Error("Run calibrate-report-models.mjs first.");
const calibration = JSON.parse(await fs.readFile(`/tmp/${files.at(-1)}`, "utf8"));
const evidence = calibration.evidence;
const results = [];
for (const kind of ["dsa", "unified"]) {
  const packet = kind === "dsa"
    ? {
        candidate: evidence.candidate,
        registration: evidence.registration,
        deterministicSynthesis: evidence.deterministicSynthesis,
        dsa: evidence.dsa,
      }
    : evidence;
  const started = performance.now();
  const generated = await callReportGenerationChain(kind, packet);
  results.push({
    kind,
    schemaVersion: generated.result.schemaVersion,
    evidenceStatus: generated.result.evidenceStatus,
    latencyMs: Math.round(performance.now() - started),
    estimatedCostUsd: generated.estimatedCostUsd,
    critique: generated.usage.critique,
  });
}
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
