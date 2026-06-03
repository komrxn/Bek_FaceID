import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, CheckCircle2, MoonStar, Users2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DayStatusPill } from "@/components/app/DayStatusPill";
import { StatsTile } from "@/components/app/StatsTile";
import { api } from "@/lib/api";
import { attendanceTodayResponseSchema, type AttendanceTodayRow, type Department } from "@/lib/zod";
import { DEPARTMENT_LABEL, DEPARTMENT_DOT } from "@/lib/department";
import { formatDate, formatTime } from "@/lib/intl";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/cn";

type DeptFilter = Department | "all";
const FILTER_VALUES: DeptFilter[] = ["all", "hall", "kitchen", "other"];
const FILTER_LABEL: Record<DeptFilter, string> = {
  all: "Все",
  hall: DEPARTMENT_LABEL.hall,
  kitchen: DEPARTMENT_LABEL.kitchen,
  other: DEPARTMENT_LABEL.other,
};

function parseFilter(raw: string | null): DeptFilter {
  return raw === "hall" || raw === "kitchen" || raw === "other" ? raw : "all";
}

export default function Attendance() {
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params.get("dept"));

  const q = useQuery({
    queryKey: ["attendance", "today"],
    queryFn: () =>
      api({ path: "/api/attendance/today", schema: attendanceTodayResponseSchema }),
    refetchInterval: 15_000,
  });

  const totals = q.data?.totals;
  const dateLabel = useMemo(
    () => (q.data ? formatDate(q.data.shift_day) : ""),
    [q.data]
  );

  const visibleRows = useMemo(() => {
    if (!q.data) return [];
    if (filter === "all") return q.data.rows;
    return q.data.rows.filter((r) => r.department === filter);
  }, [q.data, filter]);

  const setFilter = (next: DeptFilter) => {
    const nextParams = new URLSearchParams(params);
    if (next === "all") {
      nextParams.delete("dept");
    } else {
      nextParams.set("dept", next);
    }
    setParams(nextParams, { replace: true });
  };

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-display-md sm:text-display-lg tracking-tight">Посещаемость</h1>
          <p className="text-body-md text-bek-textMuted capitalize">Смена дня · {dateLabel}</p>
        </div>
      </div>

      {/* Stats tiles — 3 honest states */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatsTile
          label="Работают сейчас"
          value={totals?.working_now ?? "—"}
          tone="green"
          icon={<Activity className="h-5 w-5" strokeWidth={1.75} />}
        />
        <StatsTile
          label="Отработали"
          value={totals?.completed ?? "—"}
          tone="indigo"
          icon={<CheckCircle2 className="h-5 w-5" strokeWidth={1.75} />}
        />
        <StatsTile
          label="Не отметились"
          value={totals?.absent ?? "—"}
          tone="neutral"
          icon={<MoonStar className="h-5 w-5" strokeWidth={1.75} />}
        />
      </div>

      {/* Department filter */}
      <div
        role="tablist"
        aria-label="Фильтр по отделу"
        className="flex flex-wrap gap-1.5 rounded-xl bg-bek-surface2 p-1 self-start"
      >
        {FILTER_VALUES.map((f) => {
          const active = f === filter;
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-body-sm font-medium transition-all",
                "focus-visible:ring-2 focus-visible:ring-bek-indigo/40 focus-visible:ring-offset-2",
                active
                  ? "bg-white text-bek-text shadow-sm"
                  : "text-bek-textMuted hover:text-bek-text"
              )}
            >
              {f !== "all" && (
                <span className={cn("h-2 w-2 rounded-full", DEPARTMENT_DOT[f])} />
              )}
              {FILTER_LABEL[f]}
            </button>
          );
        })}
      </div>

      {/* States */}
      {q.isLoading && (
        <Card className="p-10 text-center text-bek-textMuted">Загрузка…</Card>
      )}
      {q.isError && (
        <Card className="p-10 text-center text-bek-red">
          Не удалось загрузить таблицу.
        </Card>
      )}
      {q.isSuccess && visibleRows.length === 0 && (
        <Card className="p-12 text-center text-bek-textMuted flex flex-col items-center gap-3">
          <Users2 className="h-7 w-7 text-bek-textFaint" strokeWidth={1.75} />
          {filter === "all"
            ? "В системе ещё нет сотрудников. Добавьте первого в разделе «Сотрудники»."
            : "Никого нет в этом отделе."}
        </Card>
      )}

      {/* Mobile: cards */}
      {q.isSuccess && visibleRows.length > 0 && (
        <div className="md:hidden flex flex-col gap-3">
          {visibleRows.map((r, idx) => (
            <MobileAttendanceCard key={r.employee_id} row={r} index={idx} />
          ))}
        </div>
      )}

      {/* Desktop: table */}
      {q.isSuccess && visibleRows.length > 0 && (
        <Card className="hidden md:block overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="text-left text-label-caps uppercase text-bek-textMuted border-b border-bek-border">
                  <th className="px-4 py-3 font-semibold">Сотрудник</th>
                  <th className="px-4 py-3 font-semibold">Отдел</th>
                  <th className="px-4 py-3 font-semibold">Пришёл</th>
                  <th className="px-4 py-3 font-semibold">Ушёл</th>
                  <th className="px-4 py-3 font-semibold">Часов</th>
                  <th className="px-4 py-3 font-semibold text-right">Статус</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, idx) => (
                  <motion.tr
                    key={r.employee_id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring.calm, delay: Math.min(idx * 0.015, 0.2) }}
                    className="border-b border-bek-border last:border-0 hover:bg-bek-surface2/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {r.photo_url ? (
                          <img
                            src={r.photo_url}
                            alt=""
                            className="h-9 w-9 object-cover mask-squircle ring-1 ring-bek-indigo/15"
                          />
                        ) : (
                          <div className="h-9 w-9 mask-squircle bg-bek-surfaceIndigo text-bek-indigo flex items-center justify-center font-semibold">
                            {r.full_name[0]}
                          </div>
                        )}
                        <div className="flex flex-col leading-tight">
                          <div className="font-medium">{r.full_name}</div>
                          <div className="text-body-sm text-bek-textMuted">{r.position}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", DEPARTMENT_DOT[r.department])} />
                        <span className="font-medium">{DEPARTMENT_LABEL[r.department]}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {r.came_at ? formatTime(r.came_at) : <span className="text-bek-textFaint">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {r.went_at ? formatTime(r.went_at) : <span className="text-bek-textFaint">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {r.worked_hours > 0 ? `${r.worked_hours.toFixed(1)} ч.` : <span className="text-bek-textFaint">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DayStatusPill isPresent={r.is_present} wentAt={r.went_at} />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function MobileAttendanceCard({ row: r, index }: { row: AttendanceTodayRow; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.calm, delay: Math.min(index * 0.015, 0.2) }}
    >
      <Card className={cn("p-4", !r.is_present && "opacity-70")}>
        <div className="flex items-start gap-3">
          {r.photo_url ? (
            <img
              src={r.photo_url}
              alt=""
              className="h-12 w-12 object-cover mask-squircle ring-1 ring-bek-indigo/15 shrink-0"
            />
          ) : (
            <div className="h-12 w-12 mask-squircle bg-bek-surfaceIndigo text-bek-indigo flex items-center justify-center font-semibold shrink-0">
              {r.full_name[0]}
            </div>
          )}
          <div className="flex flex-col leading-tight min-w-0 flex-1">
            <div className="font-semibold truncate">{r.full_name}</div>
            <div className="text-body-sm text-bek-textMuted truncate">{r.position}</div>
            <div className="mt-1 inline-flex items-center gap-1.5 text-body-sm">
              <span className={cn("h-1.5 w-1.5 rounded-full", DEPARTMENT_DOT[r.department])} />
              <span className="text-bek-textMuted">{DEPARTMENT_LABEL[r.department]}</span>
            </div>
          </div>
          <DayStatusPill isPresent={r.is_present} wentAt={r.went_at} />
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-bek-border">
          <Cell label="Пришёл" value={r.came_at ? formatTime(r.came_at) : "—"} />
          <Cell label="Ушёл" value={r.went_at ? formatTime(r.went_at) : "—"} />
          <Cell
            label="Часов"
            value={r.worked_hours > 0 ? `${r.worked_hours.toFixed(1)} ч.` : "—"}
          />
        </div>
      </Card>
    </motion.div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <div className="text-[11px] uppercase tracking-wider text-bek-textFaint">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}
