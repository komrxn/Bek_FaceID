/**
 * useCamera — wraps getUserMedia and exposes a `captureJpeg()` helper.
 *
 * On mount: tries to acquire the front camera (`facingMode: 'user'`).
 * Auto-reacquires on `devicechange` (e.g. external webcam re-plugged).
 * Provides a hidden canvas for snapshot capture; consumers call
 * `captureJpeg()` to get the latest frame as a Blob ready to POST.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "idle" | "starting" | "ready" | "denied" | "error";

export interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: CameraStatus;
  error: string | null;
  captureJpeg: (quality?: number) => Promise<Blob | null>;
}

export function useCamera(active: boolean = true): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const acquire = useCallback(async () => {
    setStatus("starting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus("ready");
    } catch (e) {
      const err = e as DOMException;
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setStatus("denied");
        setError("Доступ к камере запрещён.");
      } else {
        setStatus("error");
        setError(err?.message ?? "Не удалось получить доступ к камере.");
      }
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    acquire();
    const handler = () => acquire();
    navigator.mediaDevices?.addEventListener?.("devicechange", handler);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", handler);
      stop();
    };
  }, [active, acquire, stop]);

  const captureJpeg = useCallback(
    async (quality = 0.85): Promise<Blob | null> => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return null;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return null;

      let canvas = canvasRef.current;
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvasRef.current = canvas;
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, w, h);

      return new Promise<Blob | null>((resolve) =>
        canvas!.toBlob((blob) => resolve(blob), "image/jpeg", quality)
      );
    },
    []
  );

  return { videoRef, status, error, captureJpeg };
}
