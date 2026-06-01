/**
 * Kiosk FSM reducer.
 *
 * Single source of truth for what the user sees at any moment. The 8 states
 * are documented in CLAUDE.md and §"Kiosk UI state machine" of the plan.
 *
 * Convention:
 *   - The reducer is pure. Timers and network are driven by useEffect in
 *     pages/Kiosk.tsx watching `state.name`.
 *   - `FRAME_RESULT` is dispatched from useRecognition for every successful
 *     /api/recognize response (regardless of status).
 *   - "Sticky" success states (marked_success, error_*) ignore FRAME_RESULTs
 *     until the timeout fires; this keeps the celebratory checkmark visible
 *     even if the person walks away and a `no_face` arrives.
 */

import type { KioskAction, KioskState } from "@/types/kiosk";

export const initialState: KioskState = { name: "idle" };

export function reducer(state: KioskState, action: KioskAction): KioskState {
  switch (action.type) {
    case "RESET":
      return { name: "idle" };

    case "TIMEOUT":
      return { name: "idle" };

    case "START_SCAN": {
      // Только из idle. Включает камеру + запускает опрос.
      if (state.name !== "idle") return state;
      return { name: "scanning" };
    }

    case "TAP_BUTTON": {
      if (state.name !== "recognized_real") return state;
      return {
        name: "awaiting_button_tap",
        employee: state.employee,
        eventType: action.eventType,
      };
    }

    case "MARK_SUCCESS": {
      if (state.name !== "awaiting_button_tap") return state;
      return {
        name: "marked_success",
        employee: state.employee,
        eventType: action.eventType,
      };
    }

    case "MARK_DUPLICATE": {
      if (state.name !== "awaiting_button_tap") return state;
      return {
        name: "already_marked",
        employee: state.employee,
        eventType: action.eventType,
        whenLabel: action.whenLabel,
      };
    }

    case "MARK_ERROR": {
      // The server rejected the mark (likely 409 duplicate, or 410 stale token).
      // Surface a generic "try again" — the kiosk recovers to idle, the user
      // can walk back into frame.
      return { name: "error_unknown" };
    }

    case "FRAME_RESULT": {
      const r = action.payload;

      // В idle frame-результаты не ждём (камера выключена). Защитный no-op.
      if (state.name === "idle") return state;

      // Sticky states ignore further frame-level events.
      if (
        state.name === "marked_success" ||
        state.name === "already_marked" ||
        state.name === "awaiting_button_tap" ||
        state.name === "error_unknown" ||
        state.name === "error_spoof"
      ) {
        return state;
      }

      // Spoof is loud — interrupt anything else.
      if (r.status === "spoof") {
        return { name: "error_spoof" };
      }

      // No face / low quality → остаёмся в scanning. Таймер «нет лица 5 сек»
      // в Kiosk.tsx сам отправит TIMEOUT и вернёт нас в idle.
      if (r.status === "no_face" || r.status === "low_quality") {
        return { name: "scanning" };
      }

      // Unknown — лицо есть, но не распознано. Остаёмся scanning.
      if (r.status === "unknown") {
        return { name: "scanning" };
      }

      // status === 'recognized'
      if (!r.employee) return state;

      // Person change while we already had someone recognized → restart.
      if (
        (state.name === "recognized_real" ||
          state.name === "detected_pending_liveness") &&
        state.employee.id !== r.employee.id
      ) {
        return { name: "scanning" };
      }

      if (r.can_mark_attendance && r.pending_event_token) {
        return {
          name: "recognized_real",
          employee: r.employee,
          pendingToken: r.pending_event_token,
          lastEventToday: r.last_event_today,
        };
      }

      // Recognized but debounce not yet satisfied.
      return {
        name: "detected_pending_liveness",
        employee: r.employee,
      };
    }

    default:
      return state;
  }
}
