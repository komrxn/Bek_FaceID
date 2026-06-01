/**
 * Employee form — create OR edit, controlled by the `employee` prop.
 *
 * create mode (default):
 *   POST /api/employees → 1 round-trip (multipart with required photos).
 *
 * edit mode (employee given):
 *   PATCH /api/employees/{id}   → JSON: only changed schedule/profile fields.
 *   POST  /api/employees/{id}/photos → multipart: only if new photos picked.
 *   Both run in sequence; both 200 → close.
 */

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Slider } from "@/components/ui/Slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { PhotoDropzone } from "@/components/app/PhotoDropzone";
import { ApiError, api } from "@/lib/api";
import {
  employeeCreatedSchema,
  employeeFormSchema,
  employeeListItemSchema,
  type EmployeeFormInput,
  type EmployeeListItem,
} from "@/lib/zod";
import { spring } from "@/lib/motion";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass to enter EDIT mode. Undefined = CREATE mode. */
  employee?: EmployeeListItem | null;
}

export function EmployeeForm({ open, onOpenChange, employee }: Props) {
  const qc = useQueryClient();
  const isEdit = !!employee;

  const [photos, setPhotos] = useState<File[]>([]);
  const [badIndices, setBadIndices] = useState<number[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EmployeeFormInput>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: employee
      ? {
          full_name: employee.full_name,
          position: employee.position,
          phone: employee.phone ?? "",
          expected_arrival_time: employee.expected_arrival_time,
          min_work_hours_per_day: employee.min_work_hours_per_day,
        }
      : {
          full_name: "",
          position: "",
          phone: "",
          expected_arrival_time: "09:00",
          min_work_hours_per_day: 8,
        },
  });

  // Re-seed defaults when switching between employees (or create→edit).
  useEffect(() => {
    if (open) {
      reset(
        employee
          ? {
              full_name: employee.full_name,
              position: employee.position,
              phone: employee.phone ?? "",
              expected_arrival_time: employee.expected_arrival_time,
              min_work_hours_per_day: employee.min_work_hours_per_day,
            }
          : {
              full_name: "",
              position: "",
              phone: "",
              expected_arrival_time: "09:00",
              min_work_hours_per_day: 8,
            }
      );
      setPhotos([]);
      setBadIndices([]);
      setPhotoError(null);
    }
  }, [open, employee, reset]);

  const submit = useMutation({
    mutationFn: async (values: EmployeeFormInput) => {
      if (isEdit) {
        // 1) Patch profile/schedule (always run — backend ignores unchanged).
        await api({
          method: "PATCH",
          path: `/api/employees/${employee!.id}`,
          body: {
            full_name: values.full_name,
            position: values.position,
            phone: values.phone || null,
            expected_arrival_time: values.expected_arrival_time,
            min_work_hours_per_day: values.min_work_hours_per_day,
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
      if (values.phone) fd.append("phone", values.phone);
      fd.append("expected_arrival_time", values.expected_arrival_time);
      fd.append("min_work_hours_per_day", String(values.min_work_hours_per_day));
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
    : "Имя, должность, расписание и 1–3 чёткие фотографии лица.";
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="position">Должность</Label>
              <Input id="position" placeholder="Управляющий" {...register("position")} />
              {errors.position && (
                <p className="text-body-sm text-bek-red">{errors.position.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Телефон</Label>
              <Input id="phone" placeholder="+998 90 123 45 67" {...register("phone")} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expected_arrival_time">Время прихода</Label>
              <Input
                id="expected_arrival_time"
                type="time"
                step={60}
                {...register("expected_arrival_time")}
              />
              {errors.expected_arrival_time && (
                <p className="text-body-sm text-bek-red">
                  {errors.expected_arrival_time.message}
                </p>
              )}
            </div>

            <Controller
              control={control}
              name="min_work_hours_per_day"
              render={({ field }) => (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label>Минимум часов в день</Label>
                    <span className="text-body-md font-semibold tabular-nums">
                      {field.value} ч.
                    </span>
                  </div>
                  <Slider
                    min={1}
                    max={14}
                    step={0.5}
                    value={[field.value]}
                    onValueChange={(v) => field.onChange(v[0])}
                  />
                  {errors.min_work_hours_per_day && (
                    <p className="text-body-sm text-bek-red">
                      {errors.min_work_hours_per_day.message}
                    </p>
                  )}
                </div>
              )}
            />
          </div>

          {/* Photos */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <Label>{isEdit ? "Добавить ещё фото" : "Фотографии лица"}</Label>
              {isEdit && employee?.photo_url && photos.length === 0 && (
                <div className="flex items-center gap-2 text-body-sm text-bek-textMuted">
                  <span>Сейчас:</span>
                  <img
                    src={employee.photo_url}
                    alt=""
                    className="h-6 w-6 mask-squircle object-cover ring-1 ring-bek-indigo/15"
                  />
                  <span className="font-medium">{employee.embeddings_count} шт.</span>
                </div>
              )}
            </div>
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
    </Dialog>
  );
}
