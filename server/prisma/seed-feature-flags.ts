/**
 * Seed default platform feature flags.
 * Run: cd server && npx tsx prisma/seed-feature-flags.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PROCTORING_FEATURE_FLAGS } from "../src/services/featureFlag.service.js";

const prisma = new PrismaClient();

const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  tab_switch_detection: "Detect if candidate switches browser tab during assessment",
  copy_paste_detection: "Block copy-paste and context menu during assessment",
  devtools_detection: "Detect when developer tools are opened during assessment",
  fullscreen_required: "Require fullscreen mode during assessment",
  camera_required: "Require webcam to be on during assessment",
  multiple_face_detection: "Detect multiple faces in camera view",
  screen_recording_enabled: "Enable screen recording during assessment",
  microphone_monitoring: "Monitor microphone for unauthorized audio",
  ai_behavior_analysis: "AI-driven behavior analysis during assessment",
};

async function main() {
  for (const name of PROCTORING_FEATURE_FLAGS) {
    await prisma.platformFeatureFlag.upsert({
      where: { featureName: name },
      create: {
        featureName: name,
        mode: "OFF",
        description: DEFAULT_DESCRIPTIONS[name] ?? null,
      },
      update: {},
    });
  }
  console.log(`Seeded ${PROCTORING_FEATURE_FLAGS.length} feature flags.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
