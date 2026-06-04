import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Pencil, Plus, Search, Trash2, UserX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { PhotoLightbox } from "@/components/app/PhotoLightbox";
import { EmployeeForm } from "./EmployeeForm";
import { api } from "@/lib/api";
import { mediaUrl } from "@/lib/platform";
import {
  employeeListSchema,
  employeeListItemSchema,
  type EmployeeListItem,
} from "@/lib/zod";
import { DEPARTMENT_LABEL, DEPARTMENT_DOT } from "@/lib/department";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/cn";

export default function Employees() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingTarget, setDeletingTarget] = useState<EmployeeListItem | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const openPhoto = (url: string | null) => {
    const abs = mediaUrl(url);
    if (abs) setLightboxSrc(abs);
  };

  const employees = useQuery({
    queryKey: ["employees", { onlyActive }],
    queryFn: () =>
      api({
        path: `/api/employees?only_active=${onlyActive ? "true" : "false"}`,
        schema: employeeListSchema,
      }),
  });

  const filtered = useMemo(() => {
    if (!employees.data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return employees.data;
    return employees.data.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        e.position.toLowerCase().includes(q)
    );
  }, [employees.data, search]);

  const toggleActive = useMutation({
    mutationFn: (emp: EmployeeListItem) =>
      api({
        method: "PATCH",
        path: `/api/employees/${emp.id}`,
        body: { is_active: !emp.is_active },
        schema: employeeListItemSchema,
      }),
    onMutate: async (emp) => {
      await qc.cancelQueries({ queryKey: ["employees"] });
      const prev = qc.getQueriesData<EmployeeListItem[]>({ queryKey: ["employees"] });
      qc.setQueriesData<EmployeeListItem[]>(
        { queryKey: ["employees"] },
        (old) =>
          old?.map((e) => (e.id === emp.id ? { ...e, is_active: !e.is_active } : e))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });

  const hardDelete = useMutation({
    mutationFn: (emp: EmployeeListItem) =>
      api({
        method: "DELETE",
        path: `/api/employees/${emp.id}?hard=true`,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      setDeletingTarget(null);
    },
  });

  // Derive the editing employee from query data so the form always sees the
  // latest photo list — e.g. after a photo is deleted, the query invalidates
  // and `editing` re-resolves to the fresh row automatically.
  const editing = useMemo<EmployeeListItem | null>(() => {
    if (editingId === null || !employees.data) return null;
    return employees.data.find((e) => e.id === editingId) ?? null;
  }, [editingId, employees.data]);

  const openCreate = () => {
    setEditingId(null);
    setFormOpen(true);
  };
  const openEdit = (emp: EmployeeListItem) => {
    setEditingId(emp.id);
    setFormOpen(true);
  };

  const counts = useMemo(() => {
    if (!employees.data) return { total: 0, active: 0 };
    return {
      total: employees.data.length,
      active: employees.data.filter((e) => e.is_active).length,
    };
  }, [employees.data]);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-display-md sm:text-display-lg tracking-tight">Сотрудники</h1>
          <p className="text-body-md text-bek-textMuted">
            Активных: <span className="text-bek-text font-semibold">{counts.active}</span> из {counts.total}
          </p>
        </div>
        <Button onClick={openCreate} size="md" className="w-full sm:w-auto">
          <Plus className="h-4 w-4" strokeWidth={2} />
          Добавить
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-bek-textFaint" strokeWidth={1.75} />
          <Input
            placeholder="Поиск по имени или должности…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2.5 text-body-sm text-bek-textMuted">
          <Switch
            checked={onlyActive}
            onCheckedChange={setOnlyActive}
            aria-label="Только активные"
          />
          Только активные
        </label>
      </div>

      {/* Empty / loading / error */}
      {employees.isLoading && (
        <Card className="p-10 text-center text-bek-textMuted">Загрузка…</Card>
      )}
      {employees.isError && (
        <Card className="p-10 text-center text-bek-red">
          Не удалось загрузить список сотрудников.
        </Card>
      )}
      {employees.isSuccess && filtered.length === 0 && (
        <Card className="p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-12 w-12 rounded-xl bg-bek-surface2 flex items-center justify-center">
            <UserX className="h-6 w-6 text-bek-textFaint" strokeWidth={1.75} />
          </div>
          <div className="text-body-md text-bek-textMuted">
            {search
              ? "Никого не нашли по этому запросу."
              : "Сотрудников пока нет. Добавьте первого."}
          </div>
        </Card>
      )}

      {/* Mobile: cards */}
      {employees.isSuccess && filtered.length > 0 && (
        <div className="md:hidden flex flex-col gap-3">
          {filtered.map((emp, idx) => (
            <motion.div
              key={emp.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.calm, delay: Math.min(idx * 0.02, 0.2) }}
            >
              <Card className={cn("p-4", !emp.is_active && "opacity-60")}>
                <div className="flex items-center gap-3">
                  {emp.photo_url ? (
                    <button
                      type="button"
                      onClick={() => openPhoto(emp.photo_url)}
                      className="shrink-0 rounded-[28%/32%] focus-visible:ring-2 focus-visible:ring-bek-indigo/40 focus-visible:ring-offset-2"
                      aria-label={`Открыть фото ${emp.full_name}`}
                    >
                      <img
                        src={mediaUrl(emp.photo_url) ?? ""}
                        alt=""
                        className="h-12 w-12 object-cover mask-squircle ring-1 ring-bek-indigo/15 cursor-zoom-in"
                      />
                    </button>
                  ) : (
                    <div className="h-12 w-12 mask-squircle bg-bek-surfaceIndigo text-bek-indigo flex items-center justify-center font-semibold shrink-0">
                      {emp.full_name[0]}
                    </div>
                  )}
                  <div className="flex flex-col leading-tight min-w-0 flex-1">
                    <div className="font-semibold truncate">{emp.full_name}</div>
                    <div className="text-body-sm text-bek-textMuted truncate">{emp.position}</div>
                  </div>
                  <Switch
                    checked={emp.is_active}
                    onCheckedChange={() => toggleActive.mutate(emp)}
                    aria-label={emp.is_active ? "Деактивировать" : "Активировать"}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-bek-border">
                  <div className="flex flex-col">
                    <div className="text-[11px] uppercase tracking-wider text-bek-textFaint">Отдел</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn("h-2 w-2 rounded-full", DEPARTMENT_DOT[emp.department])} />
                      <span className="font-medium">{DEPARTMENT_LABEL[emp.department]}</span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <div className="text-[11px] uppercase tracking-wider text-bek-textFaint">Фото</div>
                    <div className="font-medium tabular-nums">{emp.embeddings_count}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-bek-border">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => openEdit(emp)}
                  >
                    <Pencil className="h-4 w-4" strokeWidth={1.75} />
                    Изменить
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-bek-red border-bek-redSoft hover:bg-bek-redSoft"
                    onClick={() => setDeletingTarget(emp)}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    Удалить
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Desktop: table */}
      {employees.isSuccess && filtered.length > 0 && (
        <Card className="hidden md:block overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="text-left text-label-caps text-bek-textMuted uppercase border-b border-bek-border">
                  <th className="px-4 py-3 font-semibold">Сотрудник</th>
                  <th className="px-4 py-3 font-semibold">Отдел</th>
                  <th className="px-4 py-3 font-semibold">Фото</th>
                  <th className="px-4 py-3 font-semibold">Активен</th>
                  <th className="px-4 py-3 font-semibold text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp, idx) => (
                  <motion.tr
                    key={emp.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring.calm, delay: Math.min(idx * 0.02, 0.2) }}
                    className={cn(
                      "border-b border-bek-border last:border-0 hover:bg-bek-surface2/40 transition-colors group",
                      !emp.is_active && "opacity-60"
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {emp.photo_url ? (
                          <button
                            type="button"
                            onClick={() => openPhoto(emp.photo_url)}
                            className="shrink-0 rounded-[28%/32%] focus-visible:ring-2 focus-visible:ring-bek-indigo/40 focus-visible:ring-offset-2"
                            aria-label={`Открыть фото ${emp.full_name}`}
                          >
                            <img
                              src={mediaUrl(emp.photo_url) ?? ""}
                              alt=""
                              className="h-10 w-10 object-cover mask-squircle ring-1 ring-bek-indigo/15 cursor-zoom-in"
                            />
                          </button>
                        ) : (
                          <div className="h-10 w-10 mask-squircle bg-bek-surfaceIndigo text-bek-indigo flex items-center justify-center font-semibold">
                            {emp.full_name[0]}
                          </div>
                        )}
                        <div className="flex flex-col leading-tight">
                          <div className="font-medium text-bek-text">{emp.full_name}</div>
                          <div className="text-body-sm text-bek-textMuted">{emp.position}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", DEPARTMENT_DOT[emp.department])} />
                        <span className="font-medium">{DEPARTMENT_LABEL[emp.department]}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-bek-textMuted">
                      {emp.embeddings_count}
                    </td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={emp.is_active}
                        onCheckedChange={() => toggleActive.mutate(emp)}
                        aria-label={emp.is_active ? "Деактивировать" : "Активировать"}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(emp)}
                          aria-label="Изменить"
                          title="Изменить"
                          className="h-9 w-9 rounded-lg text-bek-textMuted hover:bg-bek-surface2 hover:text-bek-indigo flex items-center justify-center transition-colors"
                        >
                          <Pencil className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingTarget(emp)}
                          aria-label="Удалить"
                          title="Удалить навсегда"
                          className="h-9 w-9 rounded-lg text-bek-textMuted hover:bg-bek-redSoft hover:text-bek-red flex items-center justify-center transition-colors"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Form (create or edit) */}
      <EmployeeForm
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditingId(null);
        }}
        employee={editing}
      />

      <PhotoLightbox
        src={lightboxSrc}
        onClose={() => setLightboxSrc(null)}
        alt="Фото сотрудника"
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deletingTarget}
        onOpenChange={(o) => !o && setDeletingTarget(null)}
        title={
          deletingTarget
            ? `Удалить ${deletingTarget.full_name}?`
            : "Удалить?"
        }
        description="Профиль, фотографии и эмбеддинги будут удалены безвозвратно. История посещаемости (приходы/уходы) сохранится для аудита, но сотрудник больше не появится в списке. Если просто временно отключаете — используйте переключатель «Активен»."
        confirmLabel="Удалить навсегда"
        destructive
        loading={hardDelete.isPending}
        onConfirm={() => {
          if (deletingTarget) hardDelete.mutate(deletingTarget);
        }}
      />
    </div>
  );
}
