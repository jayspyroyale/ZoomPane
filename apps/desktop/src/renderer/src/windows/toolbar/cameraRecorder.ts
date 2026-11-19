import { api } from '@/lib/api';

const MIME_CANDIDATES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

/**
 * Records the webcam with MediaRecorder and streams chunks to the main process, which writes
 * camera.webm next to the screen recording. Returns a function that stops and flushes.
 */
export async function startCameraRecorder(deviceId: string | null): Promise<() => Promise<void>> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
    },
    audio: false,
  });
  const track = stream.getVideoTracks()[0];
  const { width = 1280, height = 720 } = track.getSettings();
  const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });

  // Chunks are sent in order; keep a promise chain so none overtakes another.
  let queue = Promise.resolve();
  recorder.ondataavailable = (e) => {
    if (e.data.size === 0) return;
    const blob = e.data;
    queue = queue.then(async () => api.recorder.cameraChunk(await blob.arrayBuffer()));
  };
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));

  await new Promise<void>((resolve) => {
    recorder.onstart = () => resolve();
    recorder.start(1000);
  });
  await api.recorder.cameraStarted({ width, height });

  return async () => {
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    await queue;
    stream.getTracks().forEach((t) => t.stop());
    await api.recorder.cameraStopped();
  };
}
