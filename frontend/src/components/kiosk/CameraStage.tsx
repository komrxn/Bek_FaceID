/**
 * Camera stage — adapts to whatever space its parent grid cell gives it.
 *
 * No fixed aspect-ratio (that was the bug — it pushed the rest of the
 * UI off-screen on iPad portrait). Instead the `<video>` fills its
 * container with `object-cover`; the parent's grid row controls height.
 */

import type { RefObject } from "react";
import { motion } from "framer-motion";
import { spring } from "@/lib/motion";

interface Props {
  videoRef: RefObject<HTMLVideoElement>;
  active: boolean;
  /** When false, do NOT render the <video> element at all. Some WebViews
   *  (notably Android system WebView) render a default "press play" overlay
   *  on a `<video>` element that has no stream, which on the kiosk's idle
   *  screen looks like a circle-with-triangle icon. Unmounting prevents that. */
  mounted?: boolean;
  caption?: string;
}

export function CameraStage({ videoRef, active, mounted = true, caption }: Props) {
  return (
    <motion.div
      initial={false}
      animate={{ scale: active ? 1 : 0.97, opacity: active ? 1 : 0.6 }}
      transition={spring.calm}
      className="relative w-full h-full max-h-full overflow-hidden
                 rounded-[28px] sm:rounded-[36px] lg:rounded-[44px]
                 border border-bek-darkBorder shadow-2xl bg-black/70"
    >
      {mounted && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          // `poster` set to a 1×1 transparent PNG so the WebView never shows its
          // default media-control overlay (the "play triangle" placeholder)
          // during the moment between mount and first frame.
          poster="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII="
          className="absolute inset-0 w-full h-full object-cover -scale-x-100"
        />
      )}
      {/* Soft vignette */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.4) 100%)",
        }}
      />
      {caption && (
        <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2
                        px-4 sm:px-5 py-1.5 sm:py-2 rounded-full bg-black/55 backdrop-blur
                        text-bek-darkText text-body-sm sm:text-body-md font-medium">
          <span className="relative inline-block">
            {caption}
            <span
              aria-hidden
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer mix-blend-overlay"
            />
          </span>
        </div>
      )}
    </motion.div>
  );
}
