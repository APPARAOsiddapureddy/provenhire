// AudioWorklet: send Float32 mono frames to main thread for PCM16 → Deepgram (replaces deprecated ScriptProcessorNode).
class DeepgramCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch0 = inputs[0]?.[0];
    if (ch0 && ch0.length > 0) {
      this.port.postMessage(new Float32Array(ch0));
    }
    return true;
  }
}

registerProcessor("deepgram-capture-processor", DeepgramCaptureProcessor);
