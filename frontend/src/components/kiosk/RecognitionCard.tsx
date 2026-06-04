import { motion } from "framer-motion";
import { LogIn, LogOut } from "lucide-react";
import { spring } from "@/lib/motion";
import { formatTime } from "@/lib/intl";
import { mediaUrl } from "@/lib/platform";
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
  // V1.3: show ONE button at a time. If the employee hasn't checked in yet
  // today (or already checked out and isn't allowed to "Ушёл" twice), only
  // "Пришёл" is offered. Once they've come in, only "Ушёл" is offered.
  // This prevents the entire "tap Ушёл before tap Пришёл" failure mode.
  const showCame = !lastEventToday || lastEventToday.event_type === "went";
  const showWent = !!lastEventToday && lastEventToday.event_type === "came";

  return (
    <motion.div
      key={employee.id}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={spring.calm}
      className="flex flex-col items-center gap-5 sm:gap-7 md:gap-8 lg:gap-10 px-4 sm:px-6 lg:px-8 max-w-[680px] w-full"
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
            src={mediaUrl(employee.photo_url) ?? ""}
            alt={employee.full_name}
            className="w-36 h-36 xs:w-40 xs:h-40 sm:w-44 sm:h-44 md:w-48 md:h-48 lg:w-56 lg:h-56 object-cover mask-squircle ring-4 ring-white/15 shadow-2xl"
          />
        ) : (
          <div className="w-36 h-36 xs:w-40 xs:h-40 sm:w-44 sm:h-44 md:w-48 md:h-48 lg:w-56 lg:h-56 mask-squircle bg-bek-darkSurface2 text-bek-indigo flex items-center justify-center text-display-xl lg:text-display-2xl font-bold ring-4 ring-white/15">
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
        <div className="text-display-lg sm:text-display-xl md:text-display-xl lg:text-display-2xl text-bek-darkText leading-[1.05] text-balance">
          {employee.full_name}
        </div>
        <div className="text-display-sm sm:text-display-md text-bek-darkTextMuted">
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

      {/* Action button — only one at a time. The other state would be
          either a duplicate or backwards. */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.calm, delay: 0.16 }}
        className="w-full"
      >
        {showCame && (
          <ActionButton
            variant="came"
            onClick={onCame}
            disabled={!!awaitingType}
            loading={awaitingType === "came"}
            suggested
          >
            <LogIn className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 shrink-0" strokeWidth={1.75} />
            <span>Пришёл</span>
          </ActionButton>
        )}
        {showWent && (
          <ActionButton
            variant="went"
            onClick={onWent}
            disabled={!!awaitingType}
            loading={awaitingType === "went"}
            suggested
          >
            <LogOut className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 shrink-0" strokeWidth={1.75} />
            <span>Ушёл</span>
          </ActionButton>
        )}
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
