import { useEffect, useRef, useState } from 'react';

/** Small live camera preview so the user can frame themselves before recording. */
export function CameraPreview({ deviceId }: { deviceId: string | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 640 } } })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) video.current.srcObject = s;
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [deviceId]);

  return (
    <div className="flex justify-center py-2">
      {error ? (
        <p className="text-xs text-danger">Camera unavailable: {error}</p>
      ) : (
        <video ref={video} autoPlay muted playsInline className="h-28 w-28 rounded-full object-cover ring-2 ring-line [transform:scaleX(-1)]" />
      )}
    </div>
  );
}
