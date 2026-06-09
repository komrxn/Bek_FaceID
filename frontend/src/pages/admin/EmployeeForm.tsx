/**
 * Employee form — create OR edit, controlled by the `employee` prop.
 *
 * create mode (default):
 *   POST /api/employees → 1 round-trip (multipart with required photos).
 *
 * edit mode (employee given):
 *   PATCH /api/employees/{id}   → JSON: only changed profile fields.
 *   POST  /api/employees/{id}/photos → multipart: only if new photos picked.
 *   Both run in sequence; both 200 → close.
 *
 * V1.1: schedule fields dropped, department segmented control added.
 */

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { PhotoDropzone } from "@/components/app/PhotoDropzone";
import { PhotoLightbox } from "@/components/app/PhotoLightbox";
import { ApiError, api } from "@/lib/api";
import { mediaUrl } from "@/lib/platform";
import {
  employeeCreatedSchema,
  employeeFormSchema,
  employeeListItemSchema,
  type Department,
  type EmployeeFormInput,
  type EmployeeListItem,
  type PhotoMeta,
} from "@/lib/zod";
import {
  DEPARTMENT_VALUES,
  DEPARTMENT_LABEL,
  DEPARTMENT_DESCRIPTION,
} from "@/lib/department";
import { positionsFor, splitPosition, composePosition } from "@/lib/positions";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/cn";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass to enter EDIT mode. Undefined = CREATE mode. */
  employee?: EmployeeListItem | null;
}

const EMPTY_DEFAULTS: EmployeeFormInput = {
  full_name: "",
  position: "",
  department: "hall",
  phone: "",
};

function defaultsFor(employee: EmployeeListItem | null | undefined): EmployeeFormInput {
  return employee
    ? {
        full_name: employee.full_name,
        position: employee.position,
        department: employee.department,
        phone: employee.phone ?? "",
      }
    : EMPTY_DEFAULTS;
}

export function EmployeeForm({ open, onOpenChange, employee }: Props) {
  const qc = useQueryClient();
  const isEdit = !!employee;

  const [photos, setPhotos] = useState<File[]>([]);
  // True when the admin picked "Другое (вручную)" — free-text role entry.
  const [manualMode, setManualMode] = useState(false);
  const [badIndices, setBadIndices] = useState<number[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deletePhoto = useMutation({
    mutationFn: async (p: PhotoMeta) =>
      api({
        method: "DELETE",
        path: `/api/employees/${employee!.id}/photos/${p.embedding_id}`,
        schema: employeeListItemSchema,
      }),
    onSuccess: () => {
      // Refresh both the list (so this dialog re-renders with the trimmed
      // photos array) and any attendance views that show the primary avatar.
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      setDeleteError(null);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const body = err.body as { detail?: { msg?: string } | string } | undefined;
        const msg =
          typeof body?.detail === "string"
            ? body.detail
            : body?.detail?.msg ?? err.message;
        setDeleteError(msg);
        return;
      }
      setDeleteError("Не удалось удалить фото.");
    },
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EmployeeFormInput>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: defaultsFor(employee),
  });

  // Position options track the selected department; switching department
  // clears a now-invalid position so we never persist a role that doesn't
  // belong to the chosen отдел.
  const selectedDept = watch("department");

  // Re-seed defaults when switching between employees (or create→edit).
  useEffect(() => {
    if (open) {
      reset(defaultsFor(employee));
      setPhotos([]);
      setBadIndices([]);
      setPhotoError(null);
      // A loaded off-catalog role auto-renders as custom (base === "");
      // explicit manual mode only matters for fresh "Другое" picks.
      setManualMode(false);
    }
  }, [open, employee, reset]);

  const submit = useMutation({
    mutationFn: async (values: EmployeeFormInput) => {
      if (isEdit) {
        // 1) Patch profile (always run — backend ignores unchanged).
        await api({
          method: "PATCH",
          path: `/api/employees/${employee!.id}`,
          body: {
            full_name: values.full_name,
            position: values.position,
            department: values.department,
            phone: values.phone || null,
          },
          schema: employeeListItemSchema,
        });
        // 2) If new photos picked — append them.
        if (photos.length > 0) {
          const fd = new FormData();
          for (const f of photos) fd.append("photos", f);
          await api({
            method: "POST",
            path: `/api/employees/${employee!.id}/photos`,
            formData: fd,
            schema: employeeListItemSchema,
          });
        }
        return null;
      }
      // CREATE
      if (photos.length === 0) throw new Error("EMPTY_PHOTOS");
      const fd = new FormData();
      fd.append("full_name", values.full_name);
      fd.append("position", values.position);
      fd.append("department", values.department);
      if (values.phone) fd.append("phone", values.phone);
      for (const f of photos) fd.append("photos", f);
      return api({
        method: "POST",
        path: "/api/employees",
        formData: fd,
        schema: employeeCreatedSchema,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "EMPTY_PHOTOS") {
        setPhotoError("Загрузите хотя бы одно фото лица.");
        return;
      }
      if (err instanceof ApiError && err.status === 422) {
        const detail = err.body as { detail?: { bad_photo_indices?: number[]; msg?: string } } | undefined;
        const bad = detail?.detail?.bad_photo_indices ?? [];
        setBadIndices(bad);
        setPhotoError(detail?.detail?.msg ?? "На некоторых фото не удалось распознать лицо.");
        return;
      }
      throw err;
    },
  });

  const onSubmit = (values: EmployeeFormInput) => {
    setPhotoError(null);
    setBadIndices([]);
    return submit.mutateAsync(values);
  };

  const title = isEdit ? "Редактировать сотрудника" : "Добавить сотрудника";
  const subtitle = isEdit
    ? "Можно изменить любые поля и при желании добавить новые фотографии."
    : "Имя, должность, отдел и 1–3 чёткие фотографии лица.";
  const submitLabel = isEdit ? "Сохранить" : "Создать";

  // In edit mode submit is enabled if either profile fields changed OR new photos picked.
  const canSubmit = isEdit ? isDirty || photos.length > 0 : true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="full_name">ФИО</Label>
              <Input
                id="full_name"
                placeholder="Алишер Каримов"
                autoFocus
                {...register("full_name")}
              />
              {errors.full_name && (
                <p className="text-body-sm text-bek-red">{errors.full_name.message}</p>
              )}
            </div>

            <Controller
              control={control}
              name="position"
              render={({ field }) => {
                const opts = positionsFor(selectedDept);
                const { base, detail } = splitPosition(field.value);
                // Custom = explicit "Другое" pick, or a loaded off-catalog
                // role (non-empty value with no recognizable base).
                const isCustom = manualMode || (!!field.value && base === "");
                // A base from another department (legacy / dept just switched)
                // is still offered so editing doesn't silently drop it.
                const showForeignBase = !isCustom && !!base && !opts.includes(base);
                return (
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label htmlFor="position">Должность</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Select
                        id="position"
                        value={isCustom ? "__custom__" : base}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "__custom__") {
                            setManualMode(true);
                            field.onChange("");
                          } else {
                            setManualMode(false);
                            field.onChange(composePosition(v, detail));
                          }
                        }}
                      >
                        <option value="" disabled>
                          Выберите должность…
                        </option>
                        {showForeignBase && (
                          <option value={base}>{base} (другой отдел)</option>
                        )}
                        {opts.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                        <option value="__custom__">✏️ Другое (вручную)…</option>
                      </Select>
                      {isCustom ? (
                        <Input
                          placeholder="Например: Шеф-повар"
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      ) : (
                        <Input
                          placeholder="Уточнение: старший / 2 / помощник"
                          value={detail}
                          disabled={!base}
                          onChange={(e) =>
                            field.onChange(
                              base ? composePosition(base, e.target.value) : field.value
                            )
                          }
                        />
                      )}
                    </div>
                    <p className="text-body-sm text-bek-textMuted">
                      Должность — из списка; рядом можно дописать уточнение
                      (старший, номер, помощник) или выбрать «Другое» для своей.
                    </p>
                    {errors.position && (
                      <p className="text-body-sm text-bek-red">{errors.position.message}</p>
                    )}
                  </div>
                );
              }}
            />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Телефон</Label>
              <Input id="phone" placeholder="+998 90 123 45 67" {...register("phone")} />
            </div>

            <Controller
              control={control}
              name="department"
              render={({ field }) => (
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label>Отдел</Label>
                  <div
                    role="radiogroup"
                    aria-label="Отдел"
                    className="grid grid-cols-3 gap-2 rounded-xl bg-bek-surface2 p-1"
                  >
                    {DEPARTMENT_VALUES.map((dept) => {
                      const selected = field.value === dept;
                      return (
                        <button
                          key={dept}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => {
                            field.onChange(dept satisfies Department);
                            // Clear a catalog role that doesn't belong to the
                            // new department; leave custom roles untouched.
                            const { base } = splitPosition(getValues("position"));
                            if (base && !positionsFor(dept).includes(base)) {
                              setValue("position", "", { shouldDirty: true, shouldValidate: false });
                            }
                          }}
                          className={cn(
                            "flex flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-all",
                            "focus-visible:ring-2 focus-visible:ring-bek-indigo/40 focus-visible:ring-offset-2",
                            selected
                              ? "bg-white text-bek-text shadow-sm"
                              : "text-bek-textMuted hover:text-bek-text"
                          )}
                        >
                          <span className="text-body-md font-semibold">
                            {DEPARTMENT_LABEL[dept]}
                          </span>
                          <span className="text-body-sm text-bek-textMuted leading-tight">
                            {DEPARTMENT_DESCRIPTION[dept]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {errors.department && (
                    <p className="text-body-sm text-bek-red">{errors.department.message}</p>
                  )}
                </div>
              )}
            />
          </div>

          {/* Existing-photos gallery — edit mode only */}
          {isEdit && employee && employee.photos.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <Label>Загруженные фотографии</Label>
                <span className="text-body-sm text-bek-textMuted">
                  {employee.embeddings_count} шт.
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                <AnimatePresence initial={false}>
                  {employee.photos.map((p) => {
                    const absUrl = mediaUrl(p.photo_url) ?? "";
                    const isOnlyPhoto = employee.photos.length === 1;
                    return (
                      <motion.div
                        key={p.embedding_id}
                        layout
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        transition={spring.calm}
                        className="relative group aspect-square"
                      >
                        <button
                          type="button"
                          onClick={() => setLightboxSrc(absUrl)}
                          className="absolute inset-0 rounded-xl overflow-hidden ring-1 ring-bek-border focus-visible:ring-2 focus-visible:ring-bek-indigo/40 focus-visible:ring-offset-2"
                          aria-label="Открыть фото"
                        >
                          <img
                            src={absUrl}
                            alt=""
                            className="w-full h-full object-cover cursor-zoom-in"
                          />
                        </button>
                        {p.is_primary && (
                          <div
                            className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-bek-indigo text-white text-[10px] font-semibold uppercase tracking-wider shadow"
                            title="Основное фото — отображается на табло"
                          >
                            <Star className="h-2.5 w-2.5" strokeWidth={2.5} fill="white" />
                            Главное
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => deletePhoto.mutate(p)}
                          disabled={isOnlyPhoto || deletePhoto.isPending}
                          title={
                            isOnlyPhoto
                              ? "Сначала добавьте новое фото — нельзя оставить сотрудника без фото"
                              : "Удалить фото"
                          }
                          className={cn(
                            "absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/55 backdrop-blur text-white",
                            "flex items-center justify-center opacity-0 group-hover:opacity-100",
                            "focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white",
                            "hover:bg-bek-red transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-black/55"
                          )}
                          aria-label="Удалить фото"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
              {deleteError && (
                <p className="text-body-sm text-bek-red">{deleteError}</p>
              )}
              <p className="text-body-sm text-bek-textMuted">
                Удалите некачественное фото и добавьте новое ниже.
                Должно остаться хотя бы одно фото.
              </p>
            </div>
          )}

          {/* New photos */}
          <div className="flex flex-col gap-1.5">
            <Label>{isEdit ? "Добавить ещё фото" : "Фотографии лица"}</Label>
            <PhotoDropzone files={photos} onChange={setPhotos} disabled={isSubmitting} />
            {isEdit && photos.length === 0 && (
              <p className="text-body-sm text-bek-textMuted">
                Необязательно. Новые фото добавятся к существующим.
              </p>
            )}
            {badIndices.length > 0 && (
              <p className="text-body-sm text-bek-red">
                Лицо не найдено на фото: {badIndices.map((i) => `№ ${i + 1}`).join(", ")}.
              </p>
            )}
            {photoError && <p className="text-body-sm text-bek-red">{photoError}</p>}
          </div>

          {submit.isSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.snap}
              className="flex items-center gap-2 text-bek-green text-body-sm"
            >
              <CheckCircle2 className="h-4 w-4" />
              {isEdit ? "Изменения сохранены." : "Сотрудник добавлен."}
            </motion.div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Отмена
            </Button>
            <Button type="submit" loading={isSubmitting} disabled={!canSubmit}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <PhotoLightbox
        src={lightboxSrc}
        onClose={() => setLightboxSrc(null)}
        alt={`Фото ${employee?.full_name ?? "сотрудника"}`}
      />
    </Dialog>
  );
}
