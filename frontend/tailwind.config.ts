import type { Config } from "tailwindcss";

/**
 * BEK_FaceID design token system.
 *
 * Two scopes live in one config:
 *  - Light = admin (slate / indigo / green on white). Default.
 *  - Dark  = kiosk (`bek.darkBg` / `darkSurface`, oversized type, calm).
 *    Activated by `class="dark"` on the kiosk root.
 *
 * Motion, radius, spacing, shadow are shared.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    screens: {
      xs: "480px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        bek: {
          // light (admin)
          bg: "#F8FAFC",
          surface: "#FFFFFF",
          surface2: "#F1F5F9",
          surfaceIndigo: "#F3F1FE",
          surfaceGreen: "#F2FBF5",
          surfaceRed: "#FEF4F4",
          surfaceAmber: "#FFFBEB",
          indigo: "#4F46E5",
          indigoSoft: "#E0E7FF",
          blue: "#2563EB",
          green: "#16A34A",
          greenSoft: "#DCFCE7",
          red: "#DC2626",
          redSoft: "#FEE2E2",
          amber: "#F59E0B",
          amberSoft: "#FEF3C7",
          text: "#0F172A",
          textMuted: "#64748B",
          textFaint: "#94A3B8",
          border: "#E2E8F0",
          borderStrong: "#CBD5E1",
          // dark (kiosk)
          darkBg: "#0B1020",
          darkSurface: "#11172B",
          darkSurface2: "#1A2238",
          darkBorder: "rgba(255,255,255,0.08)",
          darkBorderStrong: "rgba(255,255,255,0.16)",
          darkText: "#F8FAFC",
          darkTextMuted: "#94A3B8",
          darkTextFaint: "#64748B",
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Display scale for kiosk + admin
        "display-2xl": ["72px", { lineHeight: "1.05", letterSpacing: "-0.03em", fontWeight: "700" }],
        "display-xl":  ["56px", { lineHeight: "1.08", letterSpacing: "-0.025em", fontWeight: "700" }],
        "display-lg":  ["40px", { lineHeight: "1.10", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-md":  ["28px", { lineHeight: "1.20", letterSpacing: "-0.015em", fontWeight: "600" }],
        "display-sm":  ["20px", { lineHeight: "1.30", letterSpacing: "-0.01em", fontWeight: "600" }],
        "body-lg":     ["18px", { lineHeight: "1.5" }],
        "body-md":     ["16px", { lineHeight: "1.5" }],
        "body-sm":     ["14px", { lineHeight: "1.5" }],
        "label-caps":  ["13px", { lineHeight: "1", letterSpacing: "0.06em", fontWeight: "600" }],
      },
      borderRadius: {
        "4xl": "32px",
      },
      boxShadow: {
        xs: "0 1px 2px rgba(15,23,42,.04), 0 0 0 1px rgba(15,23,42,.04)",
        sm: "0 2px 4px rgba(15,23,42,.06), 0 0 0 1px rgba(15,23,42,.04)",
        md: "0 4px 12px rgba(15,23,42,.08), 0 1px 3px rgba(15,23,42,.04)",
        lg: "0 8px 24px rgba(15,23,42,.10), 0 2px 6px rgba(15,23,42,.04)",
        xl: "0 16px 48px rgba(15,23,42,.14), 0 4px 12px rgba(15,23,42,.06)",
        glow: "0 0 0 1px rgba(255,255,255,.06), 0 0 48px rgba(79,70,229,.18)",
      },
      keyframes: {
        shimmer: {
          "0%":   { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "drift-a": {
          "0%, 100%": { transform: "translate(0px, 0px) scale(1)" },
          "50%":      { transform: "translate(40px, -20px) scale(1.08)" },
        },
        "drift-b": {
          "0%, 100%": { transform: "translate(0px, 0px) scale(1)" },
          "50%":      { transform: "translate(-30px, 30px) scale(1.05)" },
        },
        "soft-pulse": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.95" },
          "50%":      { transform: "scale(1.04)", opacity: "1" },
        },
      },
      animation: {
        shimmer: "shimmer 1.5s linear infinite",
        "drift-a": "drift-a 14s ease-in-out infinite",
        "drift-b": "drift-b 18s ease-in-out infinite",
        "soft-pulse": "soft-pulse 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
