import { motion } from "framer-motion";
import { spring } from "@/lib/motion";

interface Props {
  fullName: string;
  eventType: "came" | "went";
}

export function SuccessRipple({ fullName, eventType }: Props) {
  const verb = eventType === "came" ? "Здравствуйте" : "До свидания";
  const accent = eventType === "came" ? "bg-bek-green" : "bg-bek-red";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={spring.authority}
      className="flex flex-col items-center gap-10 px-10"
    >
      <motion.div
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={spring.authority}
        className={`h-28 w-28 rounded-full ${accent} flex items-center justify-center shadow-2xl`}
      >
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <motion.path
            d="M14 30 L24 40 L42 18"
            stroke="white"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.28, ease: [0, 0, 0.2, 1] }}
          />
        </svg>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.calm, delay: 0.16 }}
        className="text-center"
      >
        <div className="text-display-lg text-bek-darkText">
          {verb}, {fullName.split(" ")[1] ?? fullName.split(" ")[0]}!
        </div>
        <div className="text-display-sm text-bek-darkTextMuted mt-2">Отметка сохранена.</div>
      </motion.div>
    </motion.div>
  );
}
