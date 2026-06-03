/**
 * Platform detection + Capacitor (Android) kiosk-mode bootstrap.
 *
 * - In the regular web build (Chrome / Vite dev / nginx-served SPA),
 *   `isNative()` returns false and everything else is a no-op.
 * - In the Capacitor Android APK, the WebView serves the bundled SPA from
 *   `https://localhost/` and the React code calls `apiBase()` to point all
 *   `fetch()` at the production Cloudflare URL.
 *
 * The Capacitor imports below are tree-shaken out of the web build — the
 * runtime check at the top of `initKioskApp()` guards them, and Vite's
 * dynamic imports keep the native plugins out of the kiosk web bundle when
 * the helper is called only inside `if (isNative())` branches.
 */

import { Capacitor } from "@capacitor/core";

/** Public API URL used when the APK runs against the production server. */
const PROD_API_BASE = "https://bek-faceid.ascenderframework.dev";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Base URL prepended to every `fetch` in `lib/api.ts`.
 *
 * - Web (any host): empty string → relative path, same-origin (Vite proxy in
 *   dev, nginx in prod).
 * - Native (Capacitor): absolute Cloudflare URL — the APK's WebView origin
 *   is `https://localhost`, so we MUST send the full host.
 */
export function apiBase(): string {
  return isNative() ? PROD_API_BASE : "";
}

/**
 * Run once at app startup (called from `main.tsx`) — sets up the kiosk
 * experience on Android. No-op on the web.
 *
 * Does:
 *   - hides the system status bar
 *   - locks orientation to landscape
 *   - swallows the hardware back button so staff can't exit the kiosk
 *   - hides the splash screen once React has mounted
 *
 * Failures are swallowed (the app must still run even if a plugin is
 * missing — e.g. during the v1.2 build before icons exist).
 */
export async function initKioskApp(): Promise<void> {
  if (!isNative()) return;

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.hide();
    // If something un-hides it later, at least it'll be dark.
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    /* plugin missing or platform unsupported — ignore */
  }

  try {
    const { ScreenOrientation } = await import("@capacitor/screen-orientation");
    await ScreenOrientation.lock({ orientation: "landscape" });
  } catch {
    /* ignore */
  }

  try {
    const { App } = await import("@capacitor/app");
    App.addListener("backButton", () => {
      // Absorb the back press — kiosk has nowhere to go back to.
    });
  } catch {
    /* ignore */
  }

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch {
    /* ignore */
  }
}
