// MediaPipe loads entirely from CDN at runtime — no npm package needed at build time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FaceLandmarker = any;

export interface VisionPrediction {
  lipClosureScore: number;
  gazeStability: number;
  headStillness: number;
}

export class CVSensor {
  private faceLandmarker: FaceLandmarker | null = null;
  private initState: "idle" | "loading" | "ready" | "failed" = "idle";
  private lastTimestampMs = 0;

  private readonly suppressedVisionPatterns = [
    "Created TensorFlow Lite XNNPACK delegate for CPU",
    "Feedback manager requires a model with a single signature inference",
    "Sets FaceBlendshapesGraph acceleration to xnnpack by default",
    "OpenGL error checking is disabled",
    "TfLiteRuntime",
    "XNNPACK",
    "vulkan",
    "metal",
    "coreml",
    "DirectX",
    "INFO: ",
  ];

  private withSuppressedVisionLogs<T>(fn: () => T): T {
    const originalError = console.error;
    const originalWarn = console.warn;
    const shouldSuppress = (args: unknown[]) =>
      args.some(
        (arg) =>
          typeof arg === "string" &&
          this.suppressedVisionPatterns.some((p) => arg.includes(p)),
      );
    console.error = (...args: unknown[]) => { if (!shouldSuppress(args)) originalError(...args); };
    console.warn = (...args: unknown[]) => { if (!shouldSuppress(args)) originalWarn(...args); };
    try { return fn(); } finally { console.error = originalError; console.warn = originalWarn; }
  }

  private async initialize() {
    if (this.initState !== "idle") return;
    this.initState = "loading";
    try {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
      );
      this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "CPU",
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1,
      });
      this.initState = "ready";
    } catch {
      this.initState = "failed";
    }
  }

  public async getPrediction(video: HTMLVideoElement): Promise<VisionPrediction | null> {
    if (this.initState === "failed" || this.initState === "loading") return null;
    if (!this.faceLandmarker) { await this.initialize(); return null; }
    if (video.readyState < 2) return null;

    const now = performance.now();
    if (now - this.lastTimestampMs < 33) return null;
    this.lastTimestampMs = now;

    let result;
    try {
      result = this.withSuppressedVisionLogs(() => this.faceLandmarker!.detectForVideo(video, now));
    } catch { return null; }

    if (!result?.faceLandmarks?.length) return null;
    const landmarks = result.faceLandmarks[0];
    const blendshapes = result.faceBlendshapes?.[0]?.categories ?? [];

    const upperLip = landmarks[13];
    const lowerLip = landmarks[14];
    const lipDist = Math.sqrt(
      Math.pow(upperLip.x - lowerLip.x, 2) +
      Math.pow(upperLip.y - lowerLip.y, 2) +
      Math.pow(upperLip.z - lowerLip.z, 2),
    );
    const lipClosure = Math.max(0, Math.min(1, 1 - lipDist / 0.02));
    const jawOpen = blendshapes.find((c) => c.categoryName === "jawOpen")?.score ?? 0;
    const adjustedLipClosure = Math.min(lipClosure, 1 - jawOpen);

    const eyeLookInLeft  = blendshapes.find((c) => c.categoryName === "eyeLookInLeft")?.score ?? 0;
    const eyeLookInRight = blendshapes.find((c) => c.categoryName === "eyeLookInRight")?.score ?? 0;
    const eyeLookOutLeft = blendshapes.find((c) => c.categoryName === "eyeLookOutLeft")?.score ?? 0;
    const eyeLookOutRight= blendshapes.find((c) => c.categoryName === "eyeLookOutRight")?.score ?? 0;
    const gazeStability = 1 - Math.max(eyeLookInLeft, eyeLookInRight, eyeLookOutLeft, eyeLookOutRight);

    return { lipClosureScore: adjustedLipClosure, gazeStability, headStillness: 1 };
  }
}
