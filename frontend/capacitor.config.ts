import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the БЕК kiosk Android app.
 *
 * - `webDir: "dist"` — `cap copy android` ships `vite build` output into
 *   `android/app/src/main/assets/public/`. The WebView serves it from
 *   `https://localhost/`.
 * - `androidScheme: "https"` — WebView origin is `https://localhost`, which
 *   matches the backend CORS allow-list (see `backend/app/main.py`). Without
 *   this Capacitor defaults to `http://localhost` and mixed-content rules
 *   would block the cross-origin call to the Cloudflare URL.
 * - The app never reads from a server URL — `server.url` deliberately unset.
 *   It bundles the SPA, the kiosk only hits `/api/*` + `/static/*` on
 *   `https://bek-faceid.ascenderframework.dev` (via `lib/platform.ts`).
 */
const config: CapacitorConfig = {
  appId: "kg.bek.faceid",
  appName: "БЕК",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#0B1020",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: false,
      backgroundColor: "#0B1020",
      androidScaleType: "CENTER_CROP",
      androidSplashResourceName: "splash",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0B1020",
    },
  },
};

export default config;
