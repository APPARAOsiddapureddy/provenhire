/**
 * BlazeFace weights are vendored under /public/tf-models/blazeface so the browser loads them
 * same-origin. Default @tensorflow-models/blazeface uses tfhub.dev → Kaggle, which often 403s
 * and lacks CORS for web apps (e.g. https://provenhire.in).
 */
export function blazeFaceModelUrl(): string {
  const base = import.meta.env.BASE_URL || "/";
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return `${normalized}tf-models/blazeface/model.json`;
}

/** Official TFJS bucket — Access-Control-Allow-Origin: * (safe for browser fetch). */
export const COCO_SSD_LITE_MODEL_URL =
  "https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json";
