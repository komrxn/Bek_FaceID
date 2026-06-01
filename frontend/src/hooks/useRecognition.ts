/**
 * useRecognition — polls /api/recognize at a state-dependent cadence and
 * dispatches FSM actions on every response.
 *
 * Key rules:
 *   - Never start a new fetch if the previous one is still in flight. On a
 *     slow link (CF tunnel + mobile) one round-trip can take >500 ms; if we
 *     aborted every previous request, dispatch() would never fire and the
 *     FSM would sit in `scanning` forever — that was a real, observed bug.
 *   - Cadence is per-state. `idle` is excluded entirely (camera is off).
 *   - Stats are exposed on `window.__bekStats__` for the debug overlay.
 */

import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import { api } from "@/lib/api";
import { recognizeResponseSchema } from "@/lib/zod";
import type { KioskAction, KioskStateName } from "@/types/kiosk";

declare global {
  interface Window {
    __BEK_DEBUG__?: boolean;
    __bekStats__?: {
      sent: number;
      received: number;
      errors: number;
      lastStatus: string;
      lastSim: number;
      lastCanMark: boolean;
      lastEmployee: string | null;
    };
  }
}

const KIOSK_ID = "main";

// 500 ms = 2 кадра/с — комфортный темп для realtime-облачной связи через
// Cloudflare tunnel. Если железо быстрее — увеличим.
const CADENCE_MS: Partial<Record<KioskStateName, number>> = {
  scanning: 500,
  detected_pending_liveness: 500,
  recognized_real: 500,
};

interface Args {
  stateName: KioskStateName;
  captureJpeg: (quality?: number) => Promise<Blob | null>;
  dispatch: Dispatch<KioskAction>;
}

function ensureStats(): NonNullable<Window["__bekStats__"]> {
  if (!window.__bekStats__) {
    window.__bekStats__ = {
      sent: 0,
      received: 0,
      errors: 0,
      lastStatus: "-",
      lastSim: 0,
      lastCanMark: false,
      lastEmployee: null,
    };
  }
  return window.__bekStats__;
}

export function useRecognition({ stateName, captureJpeg, dispatch }: Args): void {
  const inflightRef = useRef(false);

  useEffect(() => {
    const interval = CADENCE_MS[stateName];
    if (!interval) return;

    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      if (inflightRef.current) return; // critical: do not abort previous

      const stats = ensureStats();
      inflightRef.current = true;

      try {
        const blob = await captureJpeg();
        if (!blob) {
          inflightRef.current = false;
          return;
        }
        const fd = new FormData();
        fd.append("frame", blob, "frame.jpg");
        fd.append("kiosk_id", KIOSK_ID);

        stats.sent += 1;
        const res = await api({
          method: "POST",
          path: "/api/recognize",
          formData: fd,
          schema: recognizeResponseSchema,
        });
        if (stopped) return;
        stats.received += 1;
        stats.lastStatus = res.status;
        stats.lastSim = res.confidence ?? 0;
        stats.lastCanMark = !!res.can_mark_attendance;
        stats.lastEmployee = res.employee?.full_name ?? null;

        if (window.__BEK_DEBUG__) {
          // eslint-disable-next-line no-console
          console.debug(
            "[recognize]",
            res.status,
            (res.confidence ?? 0).toFixed(3),
            { can_mark: res.can_mark_attendance, emp: res.employee?.full_name }
          );
        }
        dispatch({ type: "FRAME_RESULT", payload: res });
      } catch (err) {
        ensureStats().errors += 1;
        // eslint-disable-next-line no-console
        console.error("[recognize] FAILED", err);
      } finally {
        inflightRef.current = false;
      }
    };

    tick();
    const id = window.setInterval(tick, interval);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [stateName, captureJpeg, dispatch]);
}
