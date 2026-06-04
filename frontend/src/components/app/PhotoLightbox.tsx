/**
 * PhotoLightbox — fullscreen photo viewer.
 *
 * Usage: render with `src` set to an absolute URL (run through
 * `mediaUrl()` before passing). Pass null/undefined to close.
 *
 *   <PhotoLightbox src={selected} onClose={() => setSelected(null)} alt="..." />
 *
 * Click anywhere or press Esc to dismiss. The photo scales to fit the
 * viewport with a 2 vh margin so even portrait photos breathe.
 */

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { spring } from "@/lib/motion";

interface Props {
  src: string | null | undefined;
  alt?: string;
  onClose: () => void;
}

export function PhotoLightbox({ src, alt, onClose }: Props) {
  // Esc-to-close + lock body scroll while open.
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [src, onClose]);

  return (
    <AnimatePresence>
      {src && (
        <motion.div
          key="lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/85 backdrop-blur-sm cursor-zoom-out"
          role="dialog"
          aria-modal="true"
          aria-label={alt ?? "Фотография"}
        >
          <motion.button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={spring.snap}
            className="absolute top-4 right-4 h-11 w-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </motion.button>

          <motion.img
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={spring.calm}
            src={src}
            alt={alt ?? ""}
            // Cap at 96 vw / 96 vh so the photo always has a soft border.
            className="max-w-[96vw] max-h-[96vh] rounded-2xl object-contain shadow-2xl select-none"
            draggable={false}
            onClick={(e) => e.stopPropagation()}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
