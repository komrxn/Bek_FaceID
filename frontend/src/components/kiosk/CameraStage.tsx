/**
 * The left ~58 % of the kiosk screen — mirrored live video with a soft
 * rounded mask. The face-detection overlay (server-driven bbox) lands in
 * M5 alongside the anti-spoof integration; for M4 we keep the stage clean
 * so the FSM-driven scenes on the right do the heavy lifting.
 */

import type { RefObject } from "react";
import { motion } from "framer-motion";
import { spring } from "@/lib/motion";

interface Props {
  videoRef: RefObject<HTMLVideoElement>;
  active: boolean;
  caption?: string;
}

export function CameraStage({ videoRef, active, caption }: Props) {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <motion.div
        initial={false}
        animate={{ scale: active ? 1 : 0.96, opacity: active ? 1 : 0.6 }}
        transition={spring.calm}
        className="relative w-full max-w-[820px] aspect-[16/10] rounded-[40px] overflow-hidden border border-bek-darkBorder shadow-xl bg-black"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover -scale-x-100"
        />
        {/* Subtle vignette around frame */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.35) 100%)",
          }}
        />
        {caption && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-2 rounded-full bg-black/45 backdrop-blur text-bek-darkText text-body-md font-medium">
            <span className="inline-block">
              <span className="relative inline-block">
                {caption}
                <span
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer mix-blend-overlay"
                />
              </span>
            </span>
          </div>
        )}
      </motion.div>
    </div>
  );
}
