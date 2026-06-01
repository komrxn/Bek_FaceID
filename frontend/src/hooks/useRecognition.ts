/**
 * useRecognition — polls /api/recognize at a state-dependent cadence and
 * dispatches FSM actions on every response.
 *
 * Cadence:
 *   idle     — 1000 ms (low overhead, just waiting for a face)
 *   scanning, detected_pending_liveness, recognized_real — 300 ms
 *   awaiting_button_tap, marked_success, error_* — paused
 *
 * The in-flight request is aborted on next tick to keep latency bounded.
 */

import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import { api } from "@/lib/api";
import { recognizeResponseSchema } from "@/lib/zod";
import type { KioskAction, KioskStateName } from "@/types/kiosk";

const KIOSK_ID = "main";

// idle — НЕ опрашиваем (камера выключена; ждём нажатия кнопки «Начать»).
const CADENCE_MS: Partial<Record<KioskStateName, number>> = {
  scanning: 300,
  detected_pending_liveness: 300,
  recognized_real: 300,
};

interface Args {
  stateName: KioskStateName;
  captureJpeg: (quality?: number) => Promise<Blob | null>;
  dispatch: Dispatch<KioskAction>;
}

export function useRecognition({ stateName, captureJpeg, dispatch }: Args): void {
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => {
    const interval = CADENCE_MS[stateName];
    if (!interval) return;

    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      // Abort any leftover request.
      inflight.current?.abort();
      const ac = new AbortController();
      inflight.current = ac;

      try {
        const blob = await captureJpeg();
        if (!blob) return;
        const fd = new FormData();
        fd.append("frame", blob, "frame.jpg");
        fd.append("kiosk_id", KIOSK_ID);
        const res = await api({
          method: "POST",
          path: "/api/recognize",
          formData: fd,
          schema: recognizeResponseSchema,
          signal: ac.signal,
        });
        if (stopped) return;
        dispatch({ type: "FRAME_RESULT", payload: res });
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return;
        // Network blip; the next tick will retry. Don't surface — the FSM
        // stays where it is.
      }
    };

    // Run one immediately so transitions don't have to wait a full interval.
    tick();
    const id = window.setInterval(tick, interval);
    return () => {
      stopped = true;
      window.clearInterval(id);
      inflight.current?.abort();
    };
  }, [stateName, captureJpeg, dispatch]);
}
