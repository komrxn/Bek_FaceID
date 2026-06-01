import { motion } from "framer-motion";
import { LogIn, LogOut } from "lucide-react";
import { spring } from "@/lib/motion";
import { formatTime } from "@/lib/intl";
import type { EmployeePublic, LastEventToday } from "@/lib/zod";

interface Props {
  employee: EmployeePublic;
  lastEventToday: LastEventToday | null;
  awaitingType?: "came" | "went" | null;
  onCame: () => void;
  onWent: () => void;
}

export function RecognitionCard({
  employee,
  lastEventToday,
  awaitingType,
  onCame,
  onWent,
}: Props) {
  const cameSuggested = !lastEventToday || lastEventToday.event_type === "went";

  return (
    <motion.div
      key={employee.id}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={spring.calm}
      className="flex flex-col items-center gap-6 sm:gap-8 lg:gap-10 px-4 sm:px-6 lg:px-10 max-w-[640px] w-full"
    >
      {/* Photo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...spring.calm, delay: 0 }}
        className="relative"
      >
        {employee.photo_url ? (
          <img
            src={employee.photo_url}
            alt={employee.full_name}
            className="w-28 h-28 sm:w-36 sm:h-36 lg:w-44 lg:h-44 object-cover mask-squircle ring-4 ring-white/15 shadow-2xl"
          />
        ) : (
          <div className="w-28 h-28 sm:w-36 sm:h-36 lg:w-44 lg:h-44 mask-squircle bg-bek-darkSurface2 text-bek-indigo flex items-center justify-center text-display-xl lg:text-display-2xl font-bold ring-4 ring-white/15">
            {employee.full_name.slice(0, 1)}
          </div>
        )}
      </motion.div>

      {/* Name + position + last-event hint */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.calm, delay: 0.08 }}
        className="flex flex-col gap-1.5 sm:gap-2 text-center"
      >
        <div className="text-display-md sm:text-display-lg text-bek-darkText leading-tight text-balance">
          {employee.full_name}
        </div>
        <div className="text-body-md sm:text-display-sm text-bek-darkTextMuted">
          {employee.position}
        </div>
        {lastEventToday && (
          <div className="text-body-sm sm:text-body-md text-bek-darkTextFaint mt-1 sm:mt-2">
            Сегодня уже отметили{" "}
            <span className="text-bek-darkText font-semibold">
              «{lastEventToday.event_type === "came" ? "Пришёл" : "Ушёл"}»
            </span>{" "}
            в {formatTime(lastEventToday.event_ts)}.
          </div>
        )}
      </motion.div>

      {/* Action buttons — grid 2 cols on tablet+, stack on narrow phones. */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.calm, delay: 0.16 }}
        className="grid grid-cols-1 xs:grid-cols-2 gap-3 sm:gap-4 lg:gap-5 w-full"
      >
        <ActionButton
          variant="came"
          onClick={onCame}
          disabled={!!awaitingType}
          loading={awaitingType === "came"}
          suggested={cameSuggested}
        >
          <LogIn className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 shrink-0" strokeWidth={1.75} />
          <span>Пришёл</span>
        </ActionButton>
        <ActionButton
          variant="went"
          onClick={onWent}
          disabled={!!awaitingType}
          loading={awaitingType === "went"}
          suggested={!cameSuggested}
        >
          <LogOut className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 shrink-0" strokeWidth={1.75} />
          <span>Ушёл</span>
        </ActionButton>
      </motion.div>
    </motion.div>
  );
}

interface ActionButtonProps {
  variant: "came" | "went";
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  suggested?: boolean;
  children: React.ReactNode;
}

function ActionButton({
  variant,
  onClick,
  disabled,
  loading,
  suggested,
  children,
}: ActionButtonProps) {
  const colors =
    variant === "came"
      ? "bg-bek-green text-white"
      : "bg-bek-red text-white";
  const ring =
    suggested && !disabled
      ? variant === "came"
        ? "ring-4 ring-bek-green/40"
        : "ring-4 ring-bek-red/40"
      : "";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.97 }}
      transition={spring.snap}
      className={`relative h-16 sm:h-20 lg:h-[112px] rounded-3xl lg:rounded-4xl
                  text-body-lg sm:text-display-sm lg:text-display-md
                  font-semibold flex items-center justify-center gap-2 sm:gap-3
                  px-4 shadow-2xl whitespace-nowrap min-w-0
                  ${colors} ${ring}
                  ${disabled ? "opacity-70" : "hover:brightness-110 active:brightness-95"}
                  transition-all`}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <span className="h-5 w-5 sm:h-6 sm:w-6 rounded-full border-[3px] border-white/30 border-t-white animate-spin" />
      ) : (
        children
      )}
    </motion.button>
  );
}
