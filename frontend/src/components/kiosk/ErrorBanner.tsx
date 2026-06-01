import { motion } from "framer-motion";
import { Phone, ShieldAlert } from "lucide-react";
import { spring } from "@/lib/motion";

interface Props {
  variant: "unknown" | "spoof";
}

export function ErrorBanner({ variant }: Props) {
  const isSpoof = variant === "spoof";
  const Icon = isSpoof ? ShieldAlert : Phone;
  const accent = isSpoof
    ? "bg-bek-red/15 text-bek-red border-bek-red/30"
    : "bg-bek-amber/15 text-bek-amber border-bek-amber/30";
  const headline = isSpoof
    ? "Покажите лицо напрямую"
    : "Лицо не распознано";
  const sub = isSpoof
    ? "Не подносите фото или экран — поднимите голову и посмотрите в камеру."
    : "Обратитесь к управляющему для отметки вручную.";

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={spring.snap}
      role="alert"
      className={`flex flex-col items-center gap-6 px-10 max-w-[640px] text-center`}
    >
      <div
        className={`h-20 w-20 rounded-2xl border ${accent} flex items-center justify-center`}
      >
        <Icon className="h-9 w-9" strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-display-lg text-bek-darkText">{headline}</div>
        <div className="text-display-sm text-bek-darkTextMuted">{sub}</div>
      </div>
    </motion.div>
  );
}
