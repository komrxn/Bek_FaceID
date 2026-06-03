/**
 * DayStatusPill — three honest states (V1.1).
 *
 * - `Не отметился`  (gray)   — enrolled but no events at all in this shift-day
 * - `На месте`      (green)  — came, no went yet — currently on shift
 * - `Отработал`     (indigo) — came AND went, day closed
 *
 * Schedules at БЕК change too often to expose "опоздал" / "ранний уход"
 * pills — that was V1.0 noise. The new pill answers the only honest
 * question: did this person show up today, and did they finish the shift?
 */

import { Check, MoonStar } from "lucide-react";
import { cn } from "@/lib/cn";

interface Props {
  isPresent: boolean;
  wentAt: string | null;
}

export function DayStatusPill({ isPresent, wentAt }: Props) {
  if (!isPresent) {
    return (
      <Pill className="bg-bek-surface2 text-bek-textMuted">
        <MoonStar className="h-3.5 w-3.5" strokeWidth={1.75} />
        Не отметился
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
