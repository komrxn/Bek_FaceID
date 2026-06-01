import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { spring } from "@/lib/motion";

interface Props {
  fullName: string;
  eventType: "came" | "went";
  whenLabel: string;
}

export function AlreadyMarkedNotice({ fullName, eventType, whenLabel }: Props) {
  const verb = eventType === "came" ? "Пришёл" : "Ушёл";
  const firstName = fullName.split(" ")[1] ?? fullName.split(" ")[0];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={spring.authority}
      className="flex flex-col items-center gap-8 px-10 max-w-[600px] text-center"
    >
      <motion.div
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={spring.authority}
        className="h-24 w-24 rounded-full bg-bek-indigo flex items-center justify-center shadow-2xl"
      >
        <CheckCircle2 className="h-12 w-12 text-white" strokeWidth={1.75} />
      </motion.div>
      <div className="flex flex-col gap-3">
        <div className="text-display-lg text-bek-darkText">
          {firstName}, вы уже отмечались
        </div>
        <div className="text-display-sm text-bek-darkTextMuted">
          «{verb}» — {whenLabel}.<br />
          Повторно отмечать не нужно.
        </div>
      </div>
    </motion.div>
  );
}
