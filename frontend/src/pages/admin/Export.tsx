import { useState } from "react";
import { CalendarDays, Download, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { cn } from "@/lib/cn";

type Mode = "month" | "day";

function defaultMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function defaultDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthLabel(value: string): string {
  const [y, m] = value.split("-").map(Number);
  if (!y || !m) return value;
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(d);
}

function dayLabel(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  const dt = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dt);
}

export default function Export() {
  const [mode, setMode] = useState<Mode>("month");
  const [month, setMonth] = useState(defaultMonth);
  const [day, setDay] = useState(defaultDay);

  const href =
    mode === "month"
      ? `/api/export/xlsx?month=${month}`
      : `/api/export/xlsx?day=${day}`;

  const filename =
    mode === "month"
      ? `Tabel_BEK_${month}.xlsx`
      : `Posescheniye_BEK_${day}.xlsx`;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex flex-col gap-1">
        <h1 className="text-display-lg tracking-tight">Экспорт табеля</h1>
        <p className="text-body-md text-bek-textMuted">
          Скачайте табель посещаемости в Excel для бухгалтерии.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-bek-surfaceGreen text-bek-green flex items-center justify-center">
              {mode === "month" ? (
                <FileSpreadsheet className="h-5 w-5" strokeWidth={1.75} />
              ) : (
                <CalendarDays className="h-5 w-5" strokeWidth={1.75} />
              )}
            </div>
            <div className="flex-1">
              <CardTitle>
                {mode === "month" ? "Месячный табель" : "Ежедневная таблица"}
              </CardTitle>
              <CardDescription>
                {mode === "month"
                  ? "Подневная сетка с цветовой кодировкой и сводный лист по сотрудникам."
                  : "Одна строка на сотрудника за выбранный день: пришёл, ушёл, часов, статус."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Mode toggle */}
          <div
            role="tablist"
            aria-label="Тип отчёта"
            className="grid grid-cols-2 gap-1 rounded-xl bg-bek-surface2 p-1 self-start"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "month"}
              onClick={() => setMode("month")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-body-sm font-medium transition-all",
                "focus-visible:ring-2 focus-visible:ring-bek-indigo/40 focus-visible:ring-offset-2",
                mode === "month"
                  ? "bg-white text-bek-text shadow-sm"
                  : "text-bek-textMuted hover:text-bek-text"
              )}
            >
              За месяц
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "day"}
              onClick={() => setMode("day")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-body-sm font-medium transition-all",
                "focus-visible:ring-2 focus-visible:ring-bek-indigo/40 focus-visible:ring-offset-2",
                mode === "day"
                  ? "bg-white text-bek-text shadow-sm"
                  : "text-bek-textMuted hover:text-bek-text"
              )}
            >
              За день
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {mode === "month" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="month">Период</Label>
                <Input
                  id="month"
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
                <span className="text-body-sm text-bek-textMuted capitalize">
                  {monthLabel(month)}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="day">День</Label>
                <Input
                  id="day"
                  type="date"
                  value={day}
                  max={defaultDay()}
                  onChange={(e) => setDay(e.target.value)}
                />
                <span className="text-body-sm text-bek-textMuted">
                  {dayLabel(day)}
                </span>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>Имя файла</Label>
              <div className="h-11 px-3.5 py-2 rounded-xl border border-bek-border bg-bek-surface2 text-body-md text-bek-textMuted flex items-center truncate">
                {filename}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button asChild>
              <a href={href} download>
                <Download className="h-4 w-4" strokeWidth={2} />
                Скачать Excel
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Что внутри</CardTitle>
        </CardHeader>
        <CardContent className="text-body-md text-bek-textMuted flex flex-col gap-2">
          {mode === "month" ? (
            <>
              <p>
                <span className="text-bek-green font-medium">Зелёная</span> ячейка — отработал
                (пришёл и ушёл).
                {" "}<span className="text-bek-indigo font-medium">Синяя</span> — сейчас на смене
                (пришёл, ещё не ушёл).
                {" "}<span className="font-medium">Серая</span> — «не отметился».
              </p>
              <p>
                Лист «Сводка» содержит итоги по каждому сотруднику: отдел, должность,
                всего часов за месяц, сколько дней отработал и сколько дней не отметился.
              </p>
            </>
          ) : (
            <>
              <p>
                Одна страница, одна строка на сотрудника. Колонки:
                ФИО · Отдел · Должность · Пришёл · Ушёл · Часов · Статус.
              </p>
              <p>
                Статус с цветом: <span className="text-bek-green font-medium">Отработал</span>,
                {" "}<span className="text-bek-indigo font-medium">На смене</span>,
                {" "}<span className="font-medium">Не отметился</span>. Внизу — итоги за день.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
