/**
 * TensorFlow.js + BlazeFace (faces) + COCO-SSD (cell phone) for proctoring.
 * Models load once; call disposeTfProctoringModels() when tearing down.
 */

import type { NormalizedFace } from "@tensorflow-models/blazeface";
import type { ObjectDetection } from "@tensorflow-models/coco-ssd";
import { blazeFaceModelUrl, COCO_SSD_LITE_MODEL_URL } from "@/lib/tfModelUrls";

let blazefaceModel: import("@tensorflow-models/blazeface").BlazeFaceModel | null = null;
let cocoModel: ObjectDetection | null = null;
let loadPromise: Promise<void> | null = null;
let acquireCount = 0;

/** Call once per hook mount; pairs with releaseTfProctoringModels on unmount. */
export async function acquireTfProctoringModels(): Promise<void> {
  await loadTfProctoringModels();
  acquireCount += 1;
}

export function releaseTfProctoringModels(): void {
  acquireCount = Math.max(0, acquireCount - 1);
  if (acquireCount === 0) disposeTfProctoringModels();
}

export async function loadTfProctoringModels(): Promise<void> {
  if (blazefaceModel && cocoModel) return;
  if (!loadPromise) {
    loadPromise = (async () => {
      await import("@tensorflow/tfjs");
      const [blazeface, coco] = await Promise.all([
        import("@tensorflow-models/blazeface"),
        import("@tensorflow-models/coco-ssd"),
      ]);
      const [bf, cocoLoaded] = await Promise.all([
        blazeface.load({ modelUrl: blazeFaceModelUrl() }),
        coco.load({ base: "lite_mobilenet_v2", modelUrl: COCO_SSD_LITE_MODEL_URL }),
      ]);
      blazefaceModel = bf;
      cocoModel = cocoLoaded;
    })();
  }
  try {
    await loadPromise;
  } catch (e) {
    loadPromise = null;
    throw e;
  }
}

function videoIsRenderable(video: HTMLVideoElement): boolean {
  return video.readyState >= 2 && video.videoWidth > 2 && video.videoHeight > 2;
}

/**
 * BlazeFace landmarks yaw/pitch heuristic for "looking away" (single face).
 * Landmarks: [right eye, left eye, nose, mouth, right ear, left ear] in pixels.
 */
export function blazeFaceLookingAway(faces: NormalizedFace[]): boolean {
  if (faces.length !== 1) return false;
  const lm = faces[0].landmarks;
  if (!lm || lm.length < 3) return false;
  const rightEye = lm[0];
  const leftEye = lm[1];
  const nose = lm[2];
  const eyeCenterX = (rightEye[0] + leftEye[0]) / 2;
  const eyeCenterY = (rightEye[1] + leftEye[1]) / 2;
  const eyeDist = Math.max(1, Math.abs(leftEye[0] - rightEye[0]));
  const yaw = Math.abs((nose[0] - eyeCenterX) / eyeDist);
  const pitch = Math.abs((nose[1] - eyeCenterY) / eyeDist);
  return yaw > 0.18 || pitch > 0.22;
}

export async function estimateBlazeFaces(video: HTMLVideoElement): Promise<NormalizedFace[]> {
  if (!blazefaceModel || !videoIsRenderable(video)) return [];
  try {
    // flipHorizontal: typical user-media selfie feeds are mirrored in UI
    return await blazefaceModel.estimateFaces(video, false, true);
  } catch {
    return [];
  }
}

const CELL_PHONE_CLASS = "cell phone";

/** True if COCO-SSD finds a cell phone above confidence threshold. */
export async function detectCellPhoneInFrame(
  video: HTMLVideoElement,
  minScore = 0.6
): Promise<{ found: boolean; maxScore: number }> {
  if (!cocoModel || !videoIsRenderable(video)) return { found: false, maxScore: 0 };
  try {
    const predictions = await cocoModel.detect(video);
    let maxScore = 0;
    for (const p of predictions) {
      if (p.class !== CELL_PHONE_CLASS) continue;
      if (p.score > maxScore) maxScore = p.score;
      if (p.score >= minScore) return { found: true, maxScore: p.score };
    }
    return { found: false, maxScore };
  } catch {
    return { found: false, maxScore: 0 };
  }
}

export function disposeTfProctoringModels(): void {
  try {
    blazefaceModel?.dispose();
  } catch {
    /* ignore */
  }
  try {
    cocoModel?.dispose();
  } catch {
    /* ignore */
  }
  blazefaceModel = null;
  cocoModel = null;
  loadPromise = null;
}
