import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, MoonStar, Users2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DayStatusPill } from "@/components/app/DayStatusPill";
import { PhotoLightbox } from "@/components/app/PhotoLightbox";
import { StatsTile } from "@/components/app/StatsTile";
import { Select } from "@/components/ui/Select";
import { api } from "@/lib/api";
import { mediaUrl } from "@/lib/platform";
import { attendanceTodayResponseSchema, type AttendanceTodayRow, type Department } from "@/lib/zod";
import { DEPARTMENT_LABEL, DEPARTMENT_DOT } from "@/lib/department";
import { ALL_POSITIONS, positionsFor } from "@/lib/positions";
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

/** Roles offered by the position dropdown for the active department filter. */
function positionsForFilter(dept: DeptFilter): readonly string[] {
  return dept === "all" ? ALL_POSITIONS : positionsFor(dept);
}

/** A position filter is "all" unless it's a valid role for the active dept. */
function parsePosition(raw: string | null, dept: DeptFilter): string {
  return raw && positionsForFilter(dept).includes(raw) ? raw : "all";
}

function todayISO(): string {
  // RESTAURANT_TZ is Asia/Tashkent in production; for the picker default
  // we use the user's local date, which is good enough — admin will only
  // ever browse historical dates, never the future.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoAddDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export default function Attendance() {
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params.get("dept"));
  const posFilter = parsePosition(params.get("pos"), filter);
  const dayParam = params.get("day");
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : todayISO();
  const isToday = day === todayISO();

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["attendance", "today", day],
    queryFn: () =>
      api({
        path: `/api/attendance/today?shift_day=${day}`,
        schema: attendanceTodayResponseSchema,
      }),
    // Only auto-poll when the user is on today's view. Historical days are
    // immutable from the dashboard's POV, no point hammering the backend.
    refetchInterval: isToday ? 15_000 : false,
  });

  const dateLabel = useMemo(
    () => (q.data ? formatDate(q.data.shift_day) : ""),
    [q.data]
  );

  // Rows matching the dept + position filters, but presence-agnostic — these
  // feed the stat tiles, so the "Не отметились" counter stays accurate even
  // though no-shows are hidden from the list below.
  const filteredRows = useMemo(() => {
    if (!q.data) return [];
    return q.data.rows.filter(
      (r) =>
        (filter === "all" || r.department === filter) &&
        (posFilter === "all" || r.position === posFilter)
    );
  }, [q.data, filter, posFilter]);

  // What the table / cards actually render: only employees who showed up.
  // No-shows are intentionally hidden from the list (they remain in the
  // "Не отметились" tile count).
  const displayRows = useMemo(
    () => filteredRows.filter((r) => r.is_present),
    [filteredRows]
  );

  // Tiles match the active filter: when "Кухня" is selected, the counts
  // reflect kitchen-only headcount. Computed from filteredRows (all
  // employees in scope), not displayRows (present-only).
  const filteredTotals = useMemo(() => {
    const acc = { working_now: 0, completed: 0, absent: 0 };
    for (const r of filteredRows) {
      if (r.is_present && !r.went_at) acc.working_now += 1;
      else if (r.is_present) acc.completed += 1;
      else acc.absent += 1;
    }
    return acc;
  }, [filteredRows]);

  const setFilter = (next: DeptFilter) => {
    const nextParams = new URLSearchParams(params);
    if (next === "all") nextParams.delete("dept");
    else nextParams.set("dept", next);
    // A role from the old department rarely exists in the new one — drop it.
    const pos = params.get("pos");
    if (!pos || !positionsForFilter(next).includes(pos)) nextParams.delete("pos");
    setParams(nextParams, { replace: true });
  };

  const setPosFilter = (next: string) => {
    const nextParams = new URLSearchParams(params);
    if (next === "all") nextParams.delete("pos");
    else nextParams.set("pos", next);
    setParams(nextParams, { replace: true });
  };

  const setDay = (next: string) => {
    const nextParams = new URLSearchParams(params);
    if (next === todayISO()) nextParams.delete("day");
    else nextParams.set("day", next);
    setParams(nextParams, { replace: true });
  };

  const openPhoto = (url: string | null) => {
    const abs = mediaUrl(url);
    if (abs) setLightboxSrc(abs);
  };

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-display-md sm:text-display-lg tracking-tight">Посещаемость</h1>
          <p className="text-body-md text-bek-textMuted capitalize">
            Смена дня · {dateLabel}{isToday && " (сегодня)"}
          </p>
        </div>

        {/* Day navigator */}
        <div className="flex items-center gap-2 self-start sm:self-end">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDay(isoAddDays(day, -1))}
            aria-label="Предыдущий день"
            className="h-10 w-10"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </Button>
          <label className="relative">
            <span className="sr-only">Выберите день</span>
            <input
              type="date"
              value={day}
              max={todayISO()}
              onChange={(e) => setDay(e.target.value)}
              className="h-10 rounded-xl border border-bek-border bg-bek-surface px-3 pr-9 text-body-md text-bek-text font-medium focus:outline-none focus:ring-2 focus:ring-bek-indigo/40 focus:border-bek-indigo"
            />
            <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-bek-textFaint pointer-events-none" strokeWidth={1.75} />
          </label>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDay(isoAddDays(day, 1))}
            disabled={isToday}
            aria-label="Следующий день"
            className="h-10 w-10"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </Button>
          {!isToday && (
            <Button
              variant="outline"
              onClick={() => setDay(todayISO())}
              className="h-10"
            >
              Сегодня
            </Button>
          )}
        </div>
      </div>

      {/* Stats tiles — reflect the active department filter */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatsTile
          label={filter === "all" ? "Работают сейчас" : `На смене · ${FILTER_LABEL[filter]}`}
          value={q.data ? filteredTotals.working_now : "—"}
          tone="green"
          icon={<Activity className="h-5 w-5" strokeWidth={1.75} />}
        />
        <StatsTile
          label={filter === "all" ? "Отработали" : `Отработали · ${FILTER_LABEL[filter]}`}
          value={q.data ? filteredTotals.completed : "—"}
          tone="indigo"
          icon={<CheckCircle2 className="h-5 w-5" strokeWidth={1.75} />}
        />
        <StatsTile
          label={filter === "all" ? "Не отметились" : `Не отметились · ${FILTER_LABEL[filter]}`}
          value={q.data ? filteredTotals.absent : "—"}
          tone="neutral"
          icon={<MoonStar className="h-5 w-5" strokeWidth={1.75} />}
        />
      </div>

      {/* Filters: department tabs + position dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
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

        {/* Position filter — scoped to the selected department */}
        <div className="sm:w-56">
          <label className="sr-only" htmlFor="pos-filter">
            Фильтр по должности
          </label>
          <Select
            id="pos-filter"
            value={posFilter}
            onChange={(e) => setPosFilter(e.target.value)}
          >
            <option value="all">
              {filter === "all" ? "Все должности" : `Все · ${FILTER_LABEL[filter]}`}
            </option>
            {positionsForFilter(filter).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
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
      {q.isSuccess && displayRows.length === 0 && (
        <Card className="p-12 text-center text-bek-textMuted flex flex-col items-center gap-3">
          <Users2 className="h-7 w-7 text-bek-textFaint" strokeWidth={1.75} />
          {filteredRows.length === 0
            ? filter === "all" && posFilter === "all"
              ? "В системе ещё нет сотрудников. Добавьте первого в разделе «Сотрудники»."
              : "Нет сотрудников по выбранному фильтру."
            : "Пока никто не отметился по выбранному фильтру."}
        </Card>
      )}

      {/* Mobile: cards */}
      {q.isSuccess && displayRows.length > 0 && (
        <div className="md:hidden flex flex-col gap-3">
          {displayRows.map((r, idx) => (
            <MobileAttendanceCard
              key={r.employee_id}
              row={r}
              index={idx}
              onPhotoClick={() => openPhoto(r.photo_url)}
            />
          ))}
        </div>
      )}

      {/* Desktop: table */}
      {q.isSuccess && displayRows.length > 0 && (
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
                {displayRows.map((r, idx) => (
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
                          <button
                            type="button"
                            onClick={() => openPhoto(r.photo_url)}
                            className="shrink-0 rounded-[28%/32%] focus-visible:ring-2 focus-visible:ring-bek-indigo/40 focus-visible:ring-offset-2"
                            aria-label={`Открыть фото ${r.full_name}`}
                          >
                            <img
                              src={mediaUrl(r.photo_url) ?? ""}
                              alt=""
                              className="h-9 w-9 object-cover mask-squircle ring-1 ring-bek-indigo/15 cursor-zoom-in"
                            />
                          </button>
                        ) : (
                          <div className="h-9 w-9 mask-squircle bg-bek-surfaceIndigo text-bek-indigo flex items-center justify-center font-semibold shrink-0">
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

      <PhotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} alt="Фото сотрудника" />
    </div>
  );
}

function MobileAttendanceCard({
  row: r,
  index,
  onPhotoClick,
}: {
  row: AttendanceTodayRow;
  index: number;
  onPhotoClick: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.calm, delay: Math.min(index * 0.015, 0.2) }}
    >
      <Card className={cn("p-4", !r.is_present && "opacity-70")}>
        <div className="flex items-start gap-3">
          {r.photo_url ? (
            <button
              type="button"
              onClick={onPhotoClick}
              className="shrink-0 rounded-[28%/32%] focus-visible:ring-2 focus-visible:ring-bek-indigo/40 focus-visible:ring-offset-2"
              aria-label={`Открыть фото ${r.full_name}`}
            >
              <img
                src={mediaUrl(r.photo_url) ?? ""}
                alt=""
                className="h-12 w-12 object-cover mask-squircle ring-1 ring-bek-indigo/15 cursor-zoom-in"
              />
            </button>
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
