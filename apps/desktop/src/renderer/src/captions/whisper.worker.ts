/// <reference lib="webworker" />
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';

/**
 * Local speech-to-text with Whisper (ONNX, runs on the CPU via WebAssembly). The model is
 * downloaded once from the Hugging Face hub and cached by the browser; no audio leaves the machine.
 */

export type WorkerRequest = { audio: Float32Array; language: string | null };
export type WorkerMessage =
  | { type: 'progress'; stage: 'download' | 'transcribe'; progress: number }
  | { type: 'done'; segments: { start: number; end: number; text: string }[] }
  | { type: 'error'; message: string };

const MODEL = 'onnx-community/whisper-base';

env.allowLocalModels = false;
env.backends.onnx.wasm!.wasmPaths = { wasm: ortWasm };

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
const post = (m: WorkerMessage) => self.postMessage(m);

function load(): Promise<AutomaticSpeechRecognitionPipeline> {
  const files = new Map<string, { loaded: number; total: number }>();
  asr ??= pipeline('automatic-speech-recognition', MODEL, {
    dtype: 'q8',
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file || !p.total) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      post({ type: 'progress', stage: 'download', progress: loaded / total });
    },
  }) as Promise<AutomaticSpeechRecognitionPipeline>;
  return asr;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    const model = await load();
    post({ type: 'progress', stage: 'transcribe', progress: 0 });
    const result = await model(e.data.audio, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(e.data.language ? { language: e.data.language, task: 'transcribe' } : {}),
    });
    const output = Array.isArray(result) ? result[0] : result;
    const chunks: { text: string; timestamp: [number, number | null] }[] = output.chunks ?? [];
    post({
      type: 'done',
      segments: chunks
        .map((c) => ({ start: c.timestamp[0] * 1000, end: (c.timestamp[1] ?? c.timestamp[0] + 2) * 1000, text: c.text.trim() }))
        .filter((s) => s.text.length > 0),
    });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
