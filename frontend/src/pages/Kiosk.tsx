/**
 * Kiosk page — dark, hospitality-grade.
 *
 * Layout principles:
 *   - Single flex column anchored to viewport (`100dvh`) — never overflows,
 *     no `position: absolute` over content. Footer is in flow, last child.
 *   - On narrow / portrait the camera takes a *flexible* height (not a
 *     fixed aspect-ratio that would push the rest off-screen) and the
 *     scene panel stacks below it.
 *   - At ≥xl (1280px landscape) the camera and scene panel sit side by
 *     side at 3:2 — gives a calm, hospitality-grade composition.
 *   - All paddings use viewport-aware safe areas (`env(safe-area-inset-*)`).
 *
 * Visual reference: Linear's status pages, Apple's "Hello" registration
 * screen, Vercel deploy dashboards.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useCamera } from "@/hooks/useCamera";
import { useRecognition } from "@/hooks/useRecognition";
import { initialState, reducer } from "@/lib/kiosk-state-machine";
import { AlreadyMarkedNotice } from "@/components/kiosk/AlreadyMarkedNotice";
import { AmbientBackground } from "@/components/kiosk/AmbientBackground";
import { CameraStage } from "@/components/kiosk/CameraStage";
import { Clock } from "@/components/kiosk/Clock";
import { ErrorBanner } from "@/components/kiosk/ErrorBanner";
import { IdlePrompt } from "@/components/kiosk/IdlePrompt";
import { KioskFooter } from "@/components/kiosk/KioskFooter";
import { RecognitionCard } from "@/components/kiosk/RecognitionCard";
import { SuccessRipple } from "@/components/kiosk/SuccessRipple";
import { api, ApiError } from "@/lib/api";
import { attendanceMarkResponseSchema } from "@/lib/zod";
import { spring } from "@/lib/motion";

const SUCCESS_LINGER_MS = 1600;
const ERROR_LINGER_MS = 6000;
const KIOSK_BUTTON_TIMEOUT_MS = 10_000;
const NO_FACE_IDLE_MS = 5000;

export default function Kiosk() {
  // Always use dark theme on the kiosk page.
  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => document.documentElement.classList.remove("dark");
  }, []);

  const [state, dispatch] = useReducer(reducer, initialState);

  const debugMode = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "1";
  useEffect(() => { window.__BEK_DEBUG__ = debugMode; }, [debugMode]);

  const cameraActive = state.name !== "idle";
  const { videoRef, status: cameraStatus, error: cameraError, captureJpeg } =
    useCamera(cameraActive);
  const [online, setOnline] = useState(true);

  useRecognition({ stateName: state.name, captureJpeg, dispatch });

  // Timer: "no face for 5s" → idle (camera off).
  const lastFaceSeenRef = useRef<number>(Date.now());
  useEffect(() => {
    if (state.name === "scanning" || state.name === "detected_pending_liveness") {
      lastFaceSeenRef.current = Date.now();
    }
  }, [state.name]);
  useEffect(() => {
    if (state.name !== "scanning" && state.name !== "detected_pending_liveness") return;
    const id = window.setInterval(() => {
      if (Date.now() - lastFaceSeenRef.current > NO_FACE_IDLE_MS) {
        dispatch({ type: "TIMEOUT" });
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [state.name]);

  // Tap → mark.
  const markMutation = useMutation({
    mutationFn: async ({ token, eventType }: { token: string; eventType: "came" | "went" }) =>
      api({
        method: "POST",
        path: "/api/attendance/mark",
        body: { pending_event_token: token, event_type: eventType },
        schema: attendanceMarkResponseSchema,
      }),
    onSuccess: (data) => {
      setOnline(true);
      dispatch({ type: "MARK_SUCCESS", eventType: data.event_type });
    },
    onError: (err, variables) => {
      if (err instanceof ApiError && err.status >= 500) setOnline(false);
      else setOnline(true);

      if (err instanceof ApiError && err.status === 409) {
        const detail = (err.body as { detail?: { msg?: string } } | undefined)?.detail;
        const msg = detail?.msg ?? "";
        const m = msg.match(/(\d{1,2}:\d{2})/);
        dispatch({
          type: "MARK_DUPLICATE",
          eventType: variables.eventType,
          whenLabel: m ? `в ${m[1]}` : "недавно",
        });
        return;
      }
      dispatch({ type: "MARK_ERROR" });
    },
  });

  const onTap = useCallback(
    (eventType: "came" | "went") => {
      if (state.name !== "recognized_real") return;
      dispatch({ type: "TAP_BUTTON", eventType });
      markMutation.mutate({ token: state.pendingToken, eventType });
    },
    [state, markMutation]
  );

  // Sticky-state timers.
  useEffect(() => {
    let id: number | undefined;
    if (state.name === "marked_success") {
      id = window.setTimeout(() => dispatch({ type: "RESET" }), SUCCESS_LINGER_MS);
    } else if (state.name === "already_marked") {
      id = window.setTimeout(() => dispatch({ type: "RESET" }), 2400);
    } else if (state.name === "error_unknown" || state.name === "error_spoof") {
      id = window.setTimeout(() => dispatch({ type: "RESET" }), ERROR_LINGER_MS);
    } else if (state.name === "recognized_real") {
      id = window.setTimeout(() => dispatch({ type: "TIMEOUT" }), KIOSK_BUTTON_TIMEOUT_MS);
    }
    return () => { if (id) window.clearTimeout(id); };
  }, [state.name]);

  // Online detection.
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const cameraReady = cameraStatus === "ready";
  const scanCaption =
    state.name === "scanning" || state.name === "detected_pending_liveness"
      ? "Распознаю…"
      : undefined;

  return (
    <main
      className="relative flex flex-col w-full bg-bek-darkBg text-bek-darkText overflow-hidden"
      style={{ minHeight: "100dvh", height: "100dvh" }}
    >
      <AmbientBackground />

      {/* Top chrome — sits in flow, never overlaps content. */}
      <header
        className="relative z-20 flex items-center justify-end px-5 sm:px-8 lg:px-12 pt-4 sm:pt-6"
        style={{ paddingTop: "max(env(safe-area-inset-top), 1rem)" }}
      >
        <Clock />
      </header>

      {/* Main area: stretches between header and footer.
          - idle           → single full-width column, IdlePrompt centered.
          - everything else → two-column grid (camera left, scene right) on ≥lg,
                              stacked on narrower viewports. */}
      <div
        className={
          "relative z-10 flex-1 min-h-0 gap-4 sm:gap-6 lg:gap-8 px-4 sm:px-6 lg:px-10 " +
          (cameraActive
            ? "grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(360px,1fr)] " +
              "grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-1"
            : "flex items-center justify-center")
        }
      >
        {/* Camera stage — hidden entirely in idle so no <video> overlay icon
            shows up on Android WebView and the IdlePrompt can claim the whole
            screen for a focused first impression. */}
        {cameraActive && (
          <section className="relative min-h-0 flex items-center justify-center">
            {cameraStatus === "denied" || cameraStatus === "error" ? (
              <div className="w-full max-w-md flex flex-col items-center justify-center text-center gap-3 text-bek-darkTextMuted px-4">
                <div className="text-display-sm sm:text-display-md text-bek-darkText">
                  Камера недоступна
                </div>
                <p className="text-body-sm sm:text-body-md">
                  {cameraError ?? "Разрешите доступ к камере и обновите страницу."}
                </p>
              </div>
            ) : (
              <CameraStage
                videoRef={videoRef}
                active={cameraReady}
                mounted={cameraActive}
                caption={scanCaption}
              />
            )}
          </section>
        )}

        {/* Scene panel */}
        <section className="relative min-h-0 flex items-center justify-center w-full">
          <AnimatePresence mode="wait">
            {state.name === "idle" && (
              <motion.div key="idle" exit={{ opacity: 0 }} transition={spring.calm} className="w-full">
                <IdlePrompt onStart={() => dispatch({ type: "START_SCAN" })} />
              </motion.div>
            )}

            {state.name === "scanning" && (
              <motion.div
                key="scanning"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.24 }}
                className="flex flex-col items-center gap-4 sm:gap-6 text-center px-4"
              >
                <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 text-bek-indigo animate-spin" />
                <div className="text-display-sm sm:text-display-md text-bek-darkText">
                  Подождите, распознаю…
                </div>
                <div className="text-body-sm sm:text-body-md text-bek-darkTextMuted max-w-xs sm:max-w-sm">
                  Смотрите прямо в камеру и держите голову неподвижно секунду.
                </div>
              </motion.div>
            )}

            {state.name === "detected_pending_liveness" && (
              <motion.div
                key="pending"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 0.85, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={spring.calm}
                className="rounded-3xl border-2 border-dashed border-bek-indigo/40
                           px-8 py-10 sm:px-12 sm:py-16 lg:px-16 lg:py-24 text-center"
              >
                <div className="text-display-sm sm:text-display-md text-bek-darkText">Это вы?</div>
                <div className="text-body-sm sm:text-body-md text-bek-darkTextMuted mt-2">
                  Подтверждаю личность…
                </div>
              </motion.div>
            )}

            {state.name === "recognized_real" && (
              <RecognitionCard
                key={`rec-${state.employee.id}`}
                employee={state.employee}
                lastEventToday={state.lastEventToday}
                awaitingType={null}
                onCame={() => onTap("came")}
                onWent={() => onTap("went")}
              />
            )}

            {state.name === "awaiting_button_tap" && (
              <RecognitionCard
                key={`wait-${state.employee.id}`}
                employee={state.employee}
                lastEventToday={null}
                awaitingType={state.eventType}
                onCame={() => undefined}
                onWent={() => undefined}
              />
            )}

            {state.name === "marked_success" && (
              <SuccessRipple
                key={`ok-${state.employee.id}`}
                fullName={state.employee.full_name}
                eventType={state.eventType}
              />
            )}

            {state.name === "already_marked" && (
              <AlreadyMarkedNotice
                key={`am-${state.employee.id}`}
                fullName={state.employee.full_name}
                eventType={state.eventType}
                whenLabel={state.whenLabel}
              />
            )}

            {state.name === "error_unknown" && <ErrorBanner key="err-unknown" variant="unknown" />}
            {state.name === "error_spoof" && <ErrorBanner key="err-spoof" variant="spoof" />}
          </AnimatePresence>
        </section>
      </div>

      {/* Footer in flow — never overlaps content. */}
      <KioskFooter online={online} />

      {debugMode && <DebugOverlay state={state.name} cameraStatus={cameraStatus} online={online} />}
    </main>
  );
}

// -----------------------------------------------------------------------------

function DebugOverlay({
  state,
  cameraStatus,
  online,
}: {
  state: string;
  cameraStatus: string;
  online: boolean;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, []);
  const stats = window.__bekStats__;
  return (
    <div className="fixed top-4 left-4 z-50 max-w-md px-3 py-2 rounded-xl bg-black/80 text-white text-xs font-mono leading-snug pointer-events-none">
      <div>state: <b>{state}</b></div>
      <div>camera: <b>{cameraStatus}</b></div>
      <div>online: <b>{String(online)}</b></div>
      {stats && (
        <>
          <div className="mt-1 pt-1 border-t border-white/20">
            sent: <b>{stats.sent}</b> · recv: <b>{stats.received}</b> · err: <b>{stats.errors}</b>
          </div>
          <div>last: <b>{stats.lastStatus}</b> sim=<b>{stats.lastSim.toFixed(3)}</b></div>
          <div>can_mark=<b>{String(stats.lastCanMark)}</b> emp=<b>{stats.lastEmployee ?? "—"}</b></div>
        </>
      )}
    </div>
  );
}
