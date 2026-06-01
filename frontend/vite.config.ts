import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Force a single React copy across pre-bundled deps + source — without this,
    // Vite's optimizeDeps can give each dep its own React, breaking hooks.
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react-router-dom",
      "@tanstack/react-query",
      "framer-motion",
      "react-hook-form",
      "zod",
      "@hookform/resolvers/zod",
    ],
  },
  server: {
    port: 5173,
    proxy: {
      // Dev: forward /api/* to FastAPI so cookies + same-origin "just work".
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/static": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Keep the kiosk route lean — admin code splits to its own chunk
          // on first navigation to /admin/*.
          react: ["react", "react-dom", "react-router-dom"],
          motion: ["framer-motion"],
        },
      },
    },
  },
});
