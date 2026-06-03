import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

function defaultMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value: string): string {
  const [y, m] = value.split("-").map(Number);
  if (!y || !m) return value;
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(d);
}

export default function Export() {
  const [month, setMonth] = useState(defaultMonth);

  const href = `/api/export/xlsx?month=${month}`;

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
              <FileSpreadsheet className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <CardTitle>Месячный табель</CardTitle>
              <CardDescription>
                Два листа: подневная сетка с цветовой кодировкой и сводка по сотрудникам.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="month">Период</Label>
              <Input
                id="month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
              <span className="text-body-sm text-bek-textMuted capitalize">{monthLabel(month)}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Имя файла</Label>
              <div className="h-11 px-3.5 py-2 rounded-xl border border-bek-border bg-bek-surface2 text-body-md text-bek-textMuted flex items-center">
                Tabel_BEK_{month}.xlsx
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
        </CardContent>
      </Card>
    </div>
  );
}
