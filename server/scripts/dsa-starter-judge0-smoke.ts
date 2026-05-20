/**
 * Compile-check every DSA bank starter (all 5 languages × all questions) against Judge0.
 * Mirrors what "Run test cases" does before running tests (preflightCompile).
 *
 * Run from repo:
 *   cd server && npx tsx scripts/dsa-starter-judge0-smoke.ts
 *
 * Requires Judge0 (default http://127.0.0.1:2358 or JUDGE0_BASE_URL).
 */
import { DSA_API_LANGUAGES, type DsaApiLanguage } from "../src/constants/dsa.js";
import { preflightCompile } from "../src/services/judge0.js";
import { startersForQuestionNumber } from "../../src/data/dsaMultiLangStarters.ts";

const QUESTION_COUNT = 22;

async function main() {
  const failures: string[] = [];
  for (let qn = 1; qn <= QUESTION_COUNT; qn++) {
    const starters = startersForQuestionNumber(qn);
    for (const lang of DSA_API_LANGUAGES) {
      const code = starters[lang];
      if (!code?.trim()) {
        failures.push(`Q${qn} ${lang}: empty starter`);
        continue;
      }
      try {
        const r = await preflightCompile(code, lang as DsaApiLanguage);
        if (!r.ok) {
          const msg = (r.stderr ?? "unknown").replace(/\s+/g, " ").slice(0, 500);
          failures.push(`Q${qn} ${lang}: ${msg}`);
        } else {
          process.stdout.write(".");
        }
      } catch (e) {
        failures.push(`Q${qn} ${lang}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    process.stdout.write(`\nQ${qn} done\n`);
  }

  console.log("\n--- Summary ---");
  if (failures.length === 0) {
    console.log("All starters compiled successfully on Judge0.");
    process.exit(0);
  }
  console.log(`${failures.length} failure(s):\n`);
  for (const f of failures) console.log(f);
  process.exit(1);
}

main();
