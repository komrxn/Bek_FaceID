/**
 * Kiosk finite-state machine — types.
 *
 * The reducer lives in `lib/kiosk-state-machine.ts`. Eight states map to
 * eight distinct visual scenes the user sees at the door.
 */

import type { EmployeePublic, LastEventToday } from "@/lib/zod";

export type KioskStateName =
  | "idle"
  | "scanning"
  | "detected_pending_liveness"
  | "recognized_real"
  | "awaiting_button_tap"
  | "marked_success"
  | "already_marked"
  | "error_unknown"
  | "error_spoof";

interface BaseState {
  name: KioskStateName;
}

export interface IdleState extends BaseState {
  name: "idle";
}

export interface ScanningState extends BaseState {
  name: "scanning";
}

export interface DetectedPendingLivenessState extends BaseState {
  name: "detected_pending_liveness";
  employee: EmployeePublic;
  noiseStreak: number;
}

export interface RecognizedRealState extends BaseState {
  name: "recognized_real";
  employee: EmployeePublic;
  pendingToken: string;
  lastEventToday: LastEventToday | null;
  /** How many consecutive non-recognized frames we've tolerated since the last
   * confirmed recognition. Used so a brief blink/motion-blur doesn't drop
   * the card out from under the user's finger. */
  noiseStreak: number;
}

export interface DetectedPendingLivenessStateExt extends BaseState {
  name: "detected_pending_liveness";
  employee: EmployeePublic;
  noiseStreak: number;
}

export interface AwaitingButtonTapState extends BaseState {
  name: "awaiting_button_tap";
  employee: EmployeePublic;
  eventType: "came" | "went";
}

export interface MarkedSuccessState extends BaseState {
  name: "marked_success";
  employee: EmployeePublic;
  eventType: "came" | "went";
}

export interface AlreadyMarkedState extends BaseState {
  name: "already_marked";
  employee: EmployeePublic;
  eventType: "came" | "went";
  whenLabel: string; // e.g. "в 15:45"
}

export interface ErrorUnknownState extends BaseState {
  name: "error_unknown";
}

export interface ErrorSpoofState extends BaseState {
  name: "error_spoof";
}

export type KioskState =
  | IdleState
  | ScanningState
  | DetectedPendingLivenessState
  | RecognizedRealState
  | AwaitingButtonTapState
  | MarkedSuccessState
  | AlreadyMarkedState
  | ErrorUnknownState
  | ErrorSpoofState;

// Tolerate up to N consecutive non-recognized frames while the user is on
// camera before dropping the recognition card. At 300ms poll = ~900ms grace.
export const NOISE_TOLERANCE = 3;

// --- Actions -----------------------------------------------------------------

import type { RecognizeResponse } from "@/lib/zod";

export type KioskAction =
  | { type: "START_SCAN" }
  | { type: "FRAME_RESULT"; payload: RecognizeResponse }
  | { type: "TAP_BUTTON"; eventType: "came" | "went" }
  | { type: "MARK_SUCCESS"; eventType: "came" | "went" }
  | { type: "MARK_DUPLICATE"; eventType: "came" | "went"; whenLabel: string }
  | { type: "MARK_ERROR" }
  | { type: "TIMEOUT" }
  | { type: "RESET" };
