import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Activity, Clock, LogOut, MoonStar, Users2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DayStatusPill } from "@/components/app/DayStatusPill";
import { StatsTile } from "@/components/app/StatsTile";
import { api } from "@/lib/api";
import { attendanceTodayResponseSchema, type AttendanceTodayRow } from "@/lib/zod";
import { formatDate, formatTime } from "@/lib/intl";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/cn";

export default function Attendance() {
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

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-display-md sm:text-display-lg tracking-tight">Посещаемость</h1>
          <p className="text-body-md text-bek-textMuted capitalize">Смена дня · {dateLabel}</p>
        </div>
      </div>

      {/* Stats tiles — 2x2 on mobile, 4 in a row on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatsTile
          label="Работают"
          value={totals?.working_now ?? "—"}
          tone="green"
          icon={<Activity className="h-5 w-5" strokeWidth={1.75} />}
        />
        <StatsTile
          label="Опоздали"
          value={totals?.late ?? "—"}
          tone="amber"
          icon={<Clock className="h-5 w-5" strokeWidth={1.75} />}
        />
        <StatsTile
          label="Ушли раньше"
          value={totals?.early_left ?? "—"}
          tone="red"
          icon={<LogOut className="h-5 w-5" strokeWidth={1.75} />}
        />
        <StatsTile
          label="Отсутствуют"
          value={totals?.absent ?? "—"}
          tone="neutral"
          icon={<MoonStar className="h-5 w-5" strokeWidth={1.75} />}
        />
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
      {q.isSuccess && q.data.rows.length === 0 && (
        <Card className="p-12 text-center text-bek-textMuted flex flex-col items-center gap-3">
          <Users2 className="h-7 w-7 text-bek-textFaint" strokeWidth={1.75} />
          Сегодня ещё никто не отметился.
        </Card>
      )}

      {/* Mobile: cards */}
      {q.isSuccess && q.data.rows.length > 0 && (
        <div className="md:hidden flex flex-col gap-3">
          {q.data.rows.map((r, idx) => (
            <MobileAttendanceCard key={r.employee_id} row={r} index={idx} />
          ))}
        </div>
      )}

      {/* Desktop: table */}
      {q.isSuccess && q.data.rows.length > 0 && (
        <Card className="hidden md:block overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="text-left text-label-caps uppercase text-bek-textMuted border-b border-bek-border">
                  <th className="px-4 py-3 font-semibold">Сотрудник</th>
                  <th className="px-4 py-3 font-semibold">Пришёл</th>
                  <th className="px-4 py-3 font-semibold">Ушёл</th>
                  <th className="px-4 py-3 font-semibold">Часов</th>
                  <th className="px-4 py-3 font-semibold">Опозд.</th>
                  <th className="px-4 py-3 font-semibold">Ранний</th>
                  <th className="px-4 py-3 font-semibold text-right">Статус</th>
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((r, idx) => (
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
                    <td className="px-4 py-3 tabular-nums">
                      {r.came_at ? formatTime(r.came_at) : <span className="text-bek-textFaint">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {r.went_at ? formatTime(r.went_at) : <span className="text-bek-textFaint">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {r.worked_hours > 0 ? `${r.worked_hours.toFixed(1)} ч.` : <span className="text-bek-textFaint">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {r.late_minutes > 0 ? (
                        <span className="text-bek-amber font-medium">{r.late_minutes} мин</span>
                      ) : (
                        <span className="text-bek-textFaint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {r.early_leave_minutes > 0 ? (
                        <span className="text-bek-red font-medium">{r.early_leave_minutes} мин</span>
                      ) : (
                        <span className="text-bek-textFaint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DayStatusPill
                        isPresent={r.is_present}
                        wentAt={r.went_at}
                        lateMinutes={r.late_minutes}
                        earlyLeaveMinutes={r.early_leave_minutes}
                      />
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
          </div>
          <DayStatusPill
            isPresent={r.is_present}
            wentAt={r.went_at}
            lateMinutes={r.late_minutes}
            earlyLeaveMinutes={r.early_leave_minutes}
          />
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-bek-border">
          <Cell label="Пришёл" value={r.came_at ? formatTime(r.came_at) : "—"} />
          <Cell label="Ушёл" value={r.went_at ? formatTime(r.went_at) : "—"} />
          <Cell
            label="Часов"
            value={r.worked_hours > 0 ? `${r.worked_hours.toFixed(1)} ч.` : "—"}
          />
        </div>
        {(r.late_minutes > 0 || r.early_leave_minutes > 0) && (
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-bek-border text-body-sm">
            {r.late_minutes > 0 && (
              <span className="text-bek-amber">Опозд. <span className="font-semibold tabular-nums">{r.late_minutes} мин</span></span>
            )}
            {r.early_leave_minutes > 0 && (
              <span className="text-bek-red">Ранний уход <span className="font-semibold tabular-nums">{r.early_leave_minutes} мин</span></span>
            )}
          </div>
        )}
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
