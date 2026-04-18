/**
 * Antigravity interview audio engine — adapted for ProvenHire.
 * All API calls route through ProvenHire's /api/antigravity/* proxy,
 * which forwards to the configured Antigravity backend service.
 */

import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { CVSensor, type VisionPrediction } from "./vision";
import { getAuthToken } from "@/lib/api";

const AG_API = "/api/antigravity";

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function trackInterviewEvent(
  sessionId: string,
  event: string,
  fields: Record<string, unknown> = {},
  source = "frontend.audio",
  level = "info",
) {
  if (!sessionId) return;
  fetch(`${AG_API}/telemetry`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    keepalive: true,
    body: JSON.stringify({
      session_id: sessionId,
      event,
      source,
      level,
      fields: { client_ts_ms: Math.round(performance.now()), ...fields },
    }),
  }).catch(() => {});
}

export enum FloorState {
  IDLE = "IDLE",
  USER_SPEAKING = "USER_SPEAKING",
  AI_THINKING = "AI_THINKING",
  AI_SPEAKING = "AI_SPEAKING",
}

const FLOOR_CONFIG = {
  bargeInVadMs: 250,
  bargeInLockMs: 500,
  aiEchoCooldownMs: 1000,
  bargeInMinChars: 8,
  silenceThresholdMs: 5000,
  ttsFadeOutMs: 100,
  interimSnapshotThrottleMs: 350,
  utteranceSafetyTimeoutMs: 30000,
  visionPredictionThreshold: 0.85,
  audioWeight: 0.3,
  lipClosureWeight: 0.4,
  gazeStabilityWeight: 0.3,
};

function normalizeSpeechText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function isLikelyEchoSnippet(snippet: string, source: string): boolean {
  if (!snippet || !source || snippet.length < 8) return false;
  if (source.includes(snippet)) return true;
  const words = snippet.split(" ").filter((w) => w.length > 2);
  if (words.length < 2) return false;
  const overlap = words.filter((w) => source.includes(w)).length;
  return overlap >= Math.max(2, Math.ceil(words.length * 0.6));
}

export class InterviewSession {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private dgConnection: ReturnType<ReturnType<typeof createClient>["listen"]["live"]> | null = null;
  private sessionId: string;

  private visionSensor: CVSensor | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private lastSilenceStart = 0;
  private latestVision: VisionPrediction | null = null;
  private visionRafActive = false;

  public floor: FloorState = FloorState.IDLE;
  private currentAbortController: AbortController | null = null;
  private aiSpeakingStartedAt: number | null = null;
  private activeAiTextNorm = "";
  private recentAiTextNorm = "";
  private recentAiEndedAt: number | null = null;
  private activeTurnId = "";
  private bargeInVadStart: number | null = null;

  private utteranceBuffer: string[] = [];
  private utteranceFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private entityBuffer: Set<string> = new Set();
  private lastPartialSnapshotSentAt = 0;
  private lastPartialSnapshotText = "";
  private partialSnapshotSeq = 0;

  onPartial: (text: string) => void = () => {};
  onFinal: (text: string, entities: string[], metadata?: { reason: "utterance_end" | "safety_timeout"; forced: boolean }) => void = () => {};
  onBargeIn: () => void = () => {};
  onSilence: () => void = () => {};
  onFloorChange: (state: FloorState) => void = () => {};
  onError: (err: string) => void = () => {};

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  public setActiveTurnId(turnId: string) { this.activeTurnId = turnId; }
  public getActiveTurnId(): string { return this.activeTurnId; }

  public transition(newState: FloorState) {
    if (this.floor === newState) return;
    const previous = this.floor;

    if (this.floor === FloorState.AI_SPEAKING && newState !== FloorState.AI_SPEAKING) {
      if (this.activeAiTextNorm) {
        this.recentAiTextNorm = this.activeAiTextNorm;
        this.recentAiEndedAt = performance.now();
      }
      this.activeAiTextNorm = "";
    }

    this.floor = newState;
    this.aiSpeakingStartedAt = newState === FloorState.AI_SPEAKING ? performance.now() : null;
    this.bargeInVadStart = null;
    this.onFloorChange(newState);
    trackInterviewEvent(this.sessionId, "floor_transition", { from: previous, to: newState });

    if (newState === FloorState.AI_SPEAKING || newState === FloorState.AI_THINKING) {
      this.utteranceBuffer = [];
      this.entityBuffer.clear();
      if (this.utteranceFlushTimer) { clearTimeout(this.utteranceFlushTimer); this.utteranceFlushTimer = null; }
    }
  }

  async start() {
    const res = await fetch(`${AG_API}/deepgram-token`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Deepgram token fetch failed: ${res.status}`);
    const { token } = await res.json() as { token: string };
    trackInterviewEvent(this.sessionId, "audio_session_start");

    const dg = createClient(token);
    this.dgConnection = dg.listen.live({
      model: "nova-3",
      language: "en",
      encoding: "linear16",
      sample_rate: 16000,
      channels: 1,
      interim_results: true,
      vad_events: true,
      ner: true,
      endpointing: 1500,
      utterance_end_ms: 2800,
    });

    await new Promise<void>((resolve, reject) => {
      this.dgConnection!.on(LiveTranscriptionEvents.Open, () => resolve());
      this.dgConnection!.on(LiveTranscriptionEvents.Error, (e) => reject(e));
      setTimeout(() => reject(new Error("Deepgram connection timeout")), 20000);
    });

    this.transition(FloorState.USER_SPEAKING);

    this.dgConnection.on(LiveTranscriptionEvents.Transcript, async (data) => {
      const text = data?.channel?.alternatives?.[0]?.transcript ?? "";

      if (text && this.isLikelyAiEcho(text)) { this.bargeInVadStart = null; return; }
      if (text) this.lastSilenceStart = performance.now();

      if (this.floor === FloorState.AI_SPEAKING) {
        const sinceAiStarted = this.aiSpeakingStartedAt == null
          ? Infinity : performance.now() - this.aiSpeakingStartedAt;
        if (sinceAiStarted < FLOOR_CONFIG.bargeInLockMs) return;

        if (text.length >= FLOOR_CONFIG.bargeInMinChars) {
          if (this.bargeInVadStart === null) this.bargeInVadStart = performance.now();
          const vadDuration = performance.now() - this.bargeInVadStart;
          if (vadDuration >= FLOOR_CONFIG.bargeInVadMs) {
            trackInterviewEvent(this.sessionId, "barge_in_confirmed", { vad_ms: Math.round(vadDuration), chars: text.length });
            this.bargeInVadStart = null;
            this.currentAbortController?.abort();
            this.currentAbortController = null;
            this.transition(FloorState.USER_SPEAKING);
            this.onBargeIn();
            return;
          }
        } else {
          this.bargeInVadStart = null;
        }
        return;
      }
      this.bargeInVadStart = null;

      if (data.is_final && text) {
        this.utteranceBuffer.push(text);
        const rawEntities: Array<{ label: string; value: string; confidence: number }> =
          data?.channel?.alternatives?.[0]?.entities ?? [];
        const newEntities = rawEntities.filter((e) => e.confidence >= 0.7).map((e) => e.value.trim()).filter((v) => v.length > 1);
        newEntities.forEach((e) => this.entityBuffer.add(e));
        const accumulated = this.utteranceBuffer.join(" ");
        if (this.utteranceFlushTimer) clearTimeout(this.utteranceFlushTimer);
        this.utteranceFlushTimer = setTimeout(() => this._flushUtterance("safety_timeout", true), FLOOR_CONFIG.utteranceSafetyTimeoutMs);
        this.onPartial(accumulated);
        this.sendPartialTranscript(accumulated, [...this.entityBuffer], true);
      } else if (text) {
        const accumulated = this.utteranceBuffer.join(" ");
        const display = accumulated ? `${accumulated} ${text}` : text;
        this.onPartial(display);
        this.sendPartialTranscript(display, [...this.entityBuffer], false);
        if (this.floor === FloorState.IDLE || this.floor === FloorState.AI_THINKING) {
          this.transition(FloorState.USER_SPEAKING);
        }
      }

      if (this.floor === FloorState.USER_SPEAKING && this.latestVision) {
        const vision = this.latestVision;
        const silenceMs = performance.now() - this.lastSilenceStart;
        const silenceSignal = Math.min(1, silenceMs / 2000);
        const score =
          silenceSignal * FLOOR_CONFIG.audioWeight +
          vision.lipClosureScore * FLOOR_CONFIG.lipClosureWeight +
          vision.gazeStability * FLOOR_CONFIG.gazeStabilityWeight;
        if (score >= FLOOR_CONFIG.visionPredictionThreshold) {
          console.log(`[Vision] Turn likely ending (score: ${score.toFixed(2)}, silence: ${silenceMs}ms)`);
        }
      }
    });

    this.dgConnection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      if (this.utteranceFlushTimer) { clearTimeout(this.utteranceFlushTimer); this.utteranceFlushTimer = null; }
      trackInterviewEvent(this.sessionId, "utterance_end");
      this._flushUtterance("utterance_end", true);
    });

    this.dgConnection.on(LiveTranscriptionEvents.Error, (e) => { this.onError(String(e)); });

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);
    this.processor.onaudioprocess = (e) => {
      if (!this.dgConnection) return;
      this.dgConnection.send(float32ToPcm16(e.inputBuffer.getChannelData(0)));
    };
    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  public async startVision(video: HTMLVideoElement) {
    if (!this.visionSensor) this.visionSensor = new CVSensor();
    this.videoElement = video;
    this.visionRafActive = true;
    const rafTick = () => {
      if (!this.visionRafActive || !this.visionSensor || !this.videoElement) return;
      this.visionSensor.getPrediction(this.videoElement)
        .then((pred) => { if (pred) this.latestVision = pred; if (this.visionRafActive) requestAnimationFrame(rafTick); })
        .catch(() => { if (this.visionRafActive) requestAnimationFrame(rafTick); });
    };
    requestAnimationFrame(rafTick);
  }

  public setActivePlaybackText(text: string | null) {
    this.activeAiTextNorm = text ? normalizeSpeechText(text) : "";
    if (text) { this.recentAiTextNorm = ""; this.recentAiEndedAt = null; }
  }

  private isLikelyAiEcho(text: string): boolean {
    const normalized = normalizeSpeechText(text);
    if (!normalized) return false;
    if (this.activeAiTextNorm && isLikelyEchoSnippet(normalized, this.activeAiTextNorm)) return true;
    if (this.recentAiTextNorm && this.recentAiEndedAt !== null &&
        performance.now() - this.recentAiEndedAt <= FLOOR_CONFIG.aiEchoCooldownMs &&
        isLikelyEchoSnippet(normalized, this.recentAiTextNorm)) return true;
    return false;
  }

  private _flushUtterance(reason: "utterance_end" | "safety_timeout", forced = false) {
    const fullText = this.utteranceBuffer.join(" ").trim();
    const entities = [...this.entityBuffer];
    this.utteranceBuffer = [];
    this.entityBuffer.clear();
    this.lastSilenceStart = performance.now();

    if (fullText) {
      trackInterviewEvent(this.sessionId, "utterance_flushed", { reason, forced, chars: fullText.length });
      this.transition(FloorState.AI_THINKING);
      this.onFinal(fullText, entities, { reason, forced });
    } else if (this.floor === FloorState.USER_SPEAKING || this.floor === FloorState.AI_THINKING) {
      trackInterviewEvent(this.sessionId, "utterance_empty_flush", { reason, forced, floor: this.floor });
      this.onSilence();
    }
  }

  stop() {
    this.visionRafActive = false;
    this.latestVision = null;
    if (this.utteranceFlushTimer) { clearTimeout(this.utteranceFlushTimer); this.utteranceFlushTimer = null; }
    this.currentAbortController?.abort();
    this.currentAbortController = null;
    this.aiSpeakingStartedAt = null;
    this.activeTurnId = "";
    this.activeAiTextNorm = "";
    this.recentAiTextNorm = "";
    this.recentAiEndedAt = null;
    this.utteranceBuffer = [];
    this.lastPartialSnapshotSentAt = 0;
    this.lastPartialSnapshotText = "";
    this.partialSnapshotSeq = 0;
    this.processor?.disconnect();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    if (this.audioContext && this.audioContext.state !== "closed") this.audioContext.close();
    this.dgConnection?.finish();
    this.processor = null;
    this.mediaStream = null;
    this.audioContext = null;
    this.dgConnection = null;
    this.transition(FloorState.IDLE);
  }

  connectVisualizer(callback: (level: number) => void): () => void {
    if (!this.audioContext || !this.mediaStream) return () => {};
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 256;
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let running = true;
    const loop = () => {
      if (!running) return;
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      callback(avg / 128);
      requestAnimationFrame(loop);
    };
    loop();
    return () => { running = false; };
  }

  public setAbortController(ac: AbortController) { this.currentAbortController = ac; }

  private sendPartialTranscript(transcript: string, entities: string[], isFinal: boolean) {
    const cleaned = transcript.trim();
    if (!cleaned) return;
    const now = performance.now();
    if (!isFinal) {
      const changedMeaningfully = cleaned.length >= this.lastPartialSnapshotText.length + 12;
      const throttled = now - this.lastPartialSnapshotSentAt < FLOOR_CONFIG.interimSnapshotThrottleMs;
      if (!changedMeaningfully || throttled) return;
    }
    this.lastPartialSnapshotSentAt = now;
    this.lastPartialSnapshotText = cleaned;
    this.partialSnapshotSeq += 1;

    fetch(`${AG_API}/partial`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        sessionId: this.sessionId,
        transcript: cleaned,
        entities,
        turnId: this.activeTurnId,
        isFinal,
        snapshotSeq: this.partialSnapshotSeq,
      }),
    }).catch(() => {});
  }
}

// ─── Agent pipeline call ──────────────────────────────────────────────────────

export async function processTurn(
  sessionId: string,
  transcript: string,
  entities: string[] = [],
  turnId = "",
) {
  const startedAt = performance.now();
  const res = await fetch(`${AG_API}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ sessionId, transcript, entities, turnId }),
  });
  if (!res.ok) {
    trackInterviewEvent(sessionId, "frontend_process_turn_failed", { turn_id: turnId, status: res.status, elapsed_ms: Math.round(performance.now() - startedAt) }, "frontend.audio", "error");
    throw new Error(`process_turn failed: ${res.status}`);
  }
  const payload = await res.json() as Record<string, unknown>;
  trackInterviewEvent(sessionId, "frontend_process_turn", { turn_id: turnId, transcript_chars: transcript.length, entities_count: entities.length, route_kind: payload?.route_kind ?? null, elapsed_ms: Math.round(performance.now() - startedAt) });
  return payload;
}

// ─── TTS ──────────────────────────────────────────────────────────────────────

export async function prefetchAudio(text: string, sessionId?: string): Promise<string | null> {
  if (!text) return null;
  try {
    const res = await fetch(`${AG_API}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ text, sessionId: sessionId ?? "" }),
    });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  } catch { return null; }
}

export async function prefetchFillerAudio(): Promise<{ url: string | null; text: string }> {
  const fallbackText = "Interesting.";
  try {
    const res = await fetch(`${AG_API}/tts-filler`, { headers: authHeaders() });
    const fillerText = res.headers.get("X-Filler-Text")?.trim() || fallbackText;
    if (!res.ok) return { url: null, text: fillerText };
    return { url: URL.createObjectURL(await res.blob()), text: fillerText };
  } catch { return { url: null, text: fallbackText }; }
}

export async function playAudioUrl(url: string | null, text: string, signal?: AbortSignal): Promise<void> {
  if (!url) return speakWithBrowser(text, signal);
  const audio = new Audio(url);
  audio.preload = "auto";
  return new Promise((resolve) => {
    let started = false;
    const onEnded = () => { URL.revokeObjectURL(url); signal?.removeEventListener("abort", onAbort); resolve(); };
    const onAbort = () => { audio.pause(); audio.currentTime = 0; onEnded(); };
    if (signal?.aborted) { onAbort(); return; }
    const startPlayback = () => {
      if (started) return;
      started = true;
      signal?.addEventListener("abort", onAbort);
      audio.onended = onEnded;
      audio.onerror = onEnded;
      audio.play().catch(() => { if (url) URL.revokeObjectURL(url); signal?.removeEventListener("abort", onAbort); speakWithBrowser(text, signal).then(resolve); });
    };
    if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) { startPlayback(); return; }
    const onReady = () => { audio.removeEventListener("loadeddata", onReady); audio.removeEventListener("canplaythrough", onReady); startPlayback(); };
    audio.addEventListener("loadeddata", onReady, { once: true });
    audio.addEventListener("canplaythrough", onReady, { once: true });
    setTimeout(onReady, 250);
  });
}

function speakWithBrowser(text: string, signal?: AbortSignal): Promise<void> {
  if (!window.speechSynthesis) return Promise.resolve();
  if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find((v) => v.name.includes("Samantha") || v.name.includes("Karen") || v.name.includes("Google US English"));
  const speakOne = (chunk: string): Promise<void> =>
    new Promise((resolve) => {
      if (signal?.aborted) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(chunk.trim());
      u.rate = 0.95;
      if (preferred) u.voice = preferred;
      const onAbort = () => { window.speechSynthesis.cancel(); resolve(); };
      signal?.addEventListener("abort", onAbort);
      u.onend = () => { signal?.removeEventListener("abort", onAbort); resolve(); };
      u.onerror = () => { signal?.removeEventListener("abort", onAbort); resolve(); };
      window.speechSynthesis.speak(u);
    });
  return sentences.reduce((chain, sentence) => chain.then(() => { if (signal?.aborted) return; return speakOne(sentence); }), Promise.resolve() as Promise<void>);
}

function float32ToPcm16(float32: Float32Array): ArrayBuffer {
  const buf = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < float32.length; i++) {
    const c = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, c * 0x7fff, true);
  }
  return buf;
}
