import { Check, Clock, LogOut, MoonStar } from "lucide-react";
import { cn } from "@/lib/cn";

interface Props {
  isPresent: boolean;
  wentAt: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
}

export function DayStatusPill({ isPresent, wentAt, lateMinutes, earlyLeaveMinutes }: Props) {
  if (!isPresent) {
    return (
      <Pill className="bg-bek-surface2 text-bek-textMuted">
        <MoonStar className="h-3.5 w-3.5" strokeWidth={1.75} />
        Отсутствует
      </Pill>
    );
  }
  if (wentAt && earlyLeaveMinutes > 0) {
    return (
      <Pill className="bg-bek-redSoft text-bek-red">
        <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
        Ранний уход
      </Pill>
    );
  }
  if (lateMinutes > 0) {
    return (
      <Pill className="bg-bek-amberSoft text-bek-amber">
        <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
        Опоздал
      </Pill>
    );
  }
  if (wentAt) {
    return (
      <Pill className="bg-bek-surfaceIndigo text-bek-indigo">
        <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
        Отработал
      </Pill>
    );
  }
  return (
    <Pill className="bg-bek-surfaceGreen text-bek-green">
      <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
      На месте
    </Pill>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-body-sm font-medium",
        className
      )}
    >
      {children}
    </span>
  );
}
