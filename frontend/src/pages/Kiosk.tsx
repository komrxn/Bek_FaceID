/**
 * Kiosk page — dark, hospitality-grade calm.
 *
 * Left ~58 % camera stage. Right ~42 % scene-driven panel: idle hero, faint
 * recognition outline (debouncing), full recognition card with Пришёл/Ушёл,
 * success ripple, or error banner.
 *
 * The page is "dumb" — it dispatches FSM actions in response to user taps and
 * /api/recognize responses; it doesn't decide what to show beyond reading
 * `state.name` and rendering the matching scene.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

function DebugOverlay({
  state,
  cameraStatus,
  online,
}: {
  state: string;
  cameraStatus: string;
  online: boolean;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, []);
  const stats = window.__bekStats__;
  void tick; // re-render every 250ms to refresh stats
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
          <div>
            last: <b>{stats.lastStatus}</b> sim=<b>{stats.lastSim.toFixed(3)}</b>
          </div>
          <div>
            can_mark=<b>{String(stats.lastCanMark)}</b> emp=<b>{stats.lastEmployee ?? "—"}</b>
          </div>
        </>
      )}
    </div>
  );
}

const SUCCESS_LINGER_MS = 1600;
const ERROR_LINGER_MS = 6000;
const KIOSK_BUTTON_TIMEOUT_MS = 10_000;
// Если в режиме сканирования нет лица столько подряд — авто-выход в idle
// (камера выключается; следующий раз только по кнопке).
const NO_FACE_IDLE_MS = 5000;

export default function Kiosk() {
  // Always use dark theme on the kiosk page.
  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => document.documentElement.classList.remove("dark");
  }, []);

  const [state, dispatch] = useReducer(reducer, initialState);

  // Включаем подробные console logs если в URL `?debug=1`. Удобно когда
  // подключаешь iPad-Safari к Mac через Web Inspector.
  const debugMode = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "1";
  useEffect(() => {
    window.__BEK_DEBUG__ = debugMode;
  }, [debugMode]);

  // Камера живёт ТОЛЬКО когда нужна — не в idle. Это снимает запись
  // прохожих случайно мимо двери и экономит CPU.
  const cameraActive = state.name !== "idle";
  const { videoRef, status: cameraStatus, error: cameraError, captureJpeg } =
    useCamera(cameraActive);
  const [online, setOnline] = useState(true);

  useRecognition({
    stateName: state.name,
    captureJpeg,
    dispatch,
  });

  // Таймер «нет лица 5 сек подряд» — пасует scanning обратно в idle (камера off).
  const lastFaceSeenRef = useRef<number>(Date.now());
  useEffect(() => {
    // Сбрасываем «таймер последнего лица» каждый раз когда входим в активные состояния.
    if (state.name === "scanning" || state.name === "detected_pending_liveness") {
      lastFaceSeenRef.current = Date.now();
    }
  }, [state.name]);
  // Любой FRAME_RESULT с лицом обновляет timestamp; не-видение лица не обновляет.
  // Мы оборачиваем dispatch через ref-aware версию ниже — но проще:
  // useRecognition уже вызывает dispatch напрямую; нам нужен side-channel.
  // Решение: смотрим на смену state.name. Когда reducer переключается из
  // recognized_real / detected_pending_liveness обратно в scanning — лицо
  // было, обновляем. А вот «scanning остался scanning» — может быть и
  // лицо есть (unknown), и нет (no_face). Для простоты — обновляем при
  // любом не-idle изменении.
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
    mutationFn: async ({
      token,
      eventType,
    }: {
      token: string;
      eventType: "came" | "went";
    }) => {
      return api({
        method: "POST",
        path: "/api/attendance/mark",
        body: { pending_event_token: token, event_type: eventType },
        schema: attendanceMarkResponseSchema,
      });
    },
    onSuccess: (data) => {
      setOnline(true);
      dispatch({ type: "MARK_SUCCESS", eventType: data.event_type });
    },
    onError: (err, variables) => {
      if (err instanceof ApiError && err.status >= 500) setOnline(false);
      else setOnline(true);

      // 409 = «уже отмечено в течение 5 минут». Это не ошибка, а защита
      // от случайного двойного нажатия — показываем спокойное уведомление,
      // а не страшное «обратитесь к управляющему».
      if (err instanceof ApiError && err.status === 409) {
        const detail = (err.body as { detail?: { msg?: string } } | undefined)?.detail;
        const msg = detail?.msg ?? "";
        // backend returns "Уже отмечено: «came» в 15:45." — выдёргиваем время.
        const m = msg.match(/(\d{1,2}:\d{2})/);
        const whenLabel = m ? `в ${m[1]}` : "недавно";
        dispatch({
          type: "MARK_DUPLICATE",
          eventType: variables.eventType,
          whenLabel,
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

  // Timers that drive state.name === sticky → idle.
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
    return () => {
      if (id) window.clearTimeout(id);
    };
  }, [state.name]);

  // Online detection — flips false if recognize() throws beyond an HTTP code.
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
    state.name === "scanning" ||
    state.name === "detected_pending_liveness"
      ? "Распознаю…"
      : undefined;

  return (
    <main className="relative w-full h-full overflow-hidden bg-bek-darkBg text-bek-darkText">
      <AmbientBackground />

      {/* Top-right chrome — clock + date */}
      <div className="absolute top-8 right-12 z-20 flex flex-col items-end gap-1">
        <Clock />
      </div>

      {/* Main grid: 58/42 split on landscape, stacked on portrait */}
      <div className="relative z-10 w-full h-full grid grid-cols-1 xl:grid-cols-[58fr_42fr] gap-4 sm:gap-6 p-4 sm:p-8 lg:p-12 pb-24">
        {/* Camera stage (or denied-fallback) */}
        <div className="relative">
          {cameraStatus === "denied" || cameraStatus === "error" ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4 text-bek-darkTextMuted">
              <div className="text-display-md text-bek-darkText">
                Камера недоступна
              </div>
              <p className="text-body-md max-w-md">
                {cameraError ?? "Разрешите доступ к камере в настройках браузера и обновите страницу."}
              </p>
            </div>
          ) : (
            <CameraStage videoRef={videoRef} active={cameraReady} caption={scanCaption} />
          )}
        </div>

        {/* Scene panel — driven by FSM state.name */}
        <div className="relative flex items-center justify-center">
          <AnimatePresence mode="wait">
            {state.name === "idle" && (
              <motion.div key="idle" exit={{ opacity: 0 }} transition={spring.calm}>
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
                className="flex flex-col items-center gap-6 text-center"
              >
                <Loader2 className="h-10 w-10 text-bek-indigo animate-spin" />
                <div className="text-display-md text-bek-darkText">
                  Подождите, распознаю…
                </div>
                <div className="text-body-md text-bek-darkTextMuted max-w-sm">
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
                className="rounded-3xl border-2 border-dashed border-bek-indigo/40 px-16 py-24 text-center"
              >
                <div className="text-display-md text-bek-darkText">
                  Это вы?
                </div>
                <div className="text-body-md text-bek-darkTextMuted mt-2">
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

            {state.name === "error_unknown" && (
              <ErrorBanner key="err-unknown" variant="unknown" />
            )}
            {state.name === "error_spoof" && (
              <ErrorBanner key="err-spoof" variant="spoof" />
            )}
          </AnimatePresence>
        </div>
      </div>

      <KioskFooter online={online} />

      {/* On-screen debug overlay — shown when URL has ?debug=1. */}
      {debugMode && <DebugOverlay state={state.name} cameraStatus={cameraStatus} online={online} />}
    </main>
  );
}
