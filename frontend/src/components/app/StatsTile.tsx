import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

interface Props {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "neutral" | "green" | "amber" | "red" | "indigo";
  icon?: React.ReactNode;
}

const TONE_BG: Record<NonNullable<Props["tone"]>, string> = {
  neutral: "bg-bek-surface2 text-bek-textMuted",
  indigo:  "bg-bek-surfaceIndigo text-bek-indigo",
  green:   "bg-bek-surfaceGreen text-bek-green",
  amber:   "bg-bek-amberSoft text-bek-amber",
  red:     "bg-bek-surfaceRed text-bek-red",
};

export function StatsTile({ label, value, hint, tone = "neutral", icon }: Props) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="text-label-caps uppercase text-bek-textMuted">{label}</div>
          <div className="text-display-lg tabular-nums">{value}</div>
          {hint && <div className="text-body-sm text-bek-textFaint">{hint}</div>}
        </div>
        {icon && (
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", TONE_BG[tone])}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
