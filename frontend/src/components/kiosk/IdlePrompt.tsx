import { motion } from "framer-motion";
import { ScanFace } from "lucide-react";
import { greetingFor, useTimeOfDay } from "@/hooks/useTimeOfDay";
import { Clock } from "./Clock";
import { spring } from "@/lib/motion";

interface Props {
  onStart: () => void;
}

export function IdlePrompt({ onStart }: Props) {
  const tod = useTimeOfDay();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.calm}
      className="flex flex-col items-center justify-center gap-6 sm:gap-8 lg:gap-12 text-center px-4"
    >
      <Clock size="big" />

      <div className="flex flex-col items-center gap-2 sm:gap-3">
        <div className="text-display-md sm:text-display-lg lg:text-display-xl text-bek-darkText">
          {greetingFor(tod)}!
        </div>
        <div className="text-body-md sm:text-display-sm text-bek-darkTextMuted max-w-md">
          Нажмите, чтобы отметить приход или уход.
        </div>
      </div>

      <motion.button
        type="button"
        onClick={onStart}
        whileTap={{ scale: 0.96 }}
        transition={spring.snap}
        className="group relative h-20 sm:h-28 lg:h-[140px] px-6 sm:px-10 lg:px-14
                   rounded-3xl lg:rounded-4xl bg-bek-indigo text-white flex items-center
                   gap-3 sm:gap-4 lg:gap-5 shadow-2xl
                   hover:brightness-110 active:brightness-95 transition-all
                   focus-visible:ring-4 focus-visible:ring-bek-indigo/40 focus-visible:ring-offset-4 focus-visible:ring-offset-bek-darkBg"
        aria-label="Начать распознавание"
      >
        <motion.span
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
          className="flex items-center justify-center h-10 w-10 sm:h-12 sm:w-12 lg:h-16 lg:w-16 rounded-xl lg:rounded-2xl bg-white/10 shrink-0"
        >
          <ScanFace className="h-5 w-5 sm:h-7 sm:w-7 lg:h-9 lg:w-9" strokeWidth={1.75} />
        </motion.span>
        <span className="text-body-lg sm:text-display-sm lg:text-display-md font-semibold whitespace-nowrap">
          Распознать лицо
        </span>
      </motion.button>
    </motion.div>
  );
}
