/**
 * Zod schemas — single source of truth for API + form types.
 *
 * Backend `app/db/schemas.py` mirrors these shapes. When changing, update
 * both sides AND `tests/test_recognize_endpoint.py` to lock in the
 * contract.
 */

import { z } from "zod";

// ---- Auth ----

export const meSchema = z.object({
  username: z.string(),
});
export type Me = z.infer<typeof meSchema>;

export const loginSchema = z.object({
  username: z.string().min(1, "Введите логин"),
  password: z.string().min(1, "Введите пароль"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ---- Recognize ----

export const recognizeStatusSchema = z.enum([
  "recognized",
  "unknown",
  "no_face",
  "low_quality",
  "spoof",
]);
export type RecognizeStatus = z.infer<typeof recognizeStatusSchema>;

export const employeePublicSchema = z.object({
  id: z.number().int(),
  full_name: z.string(),
  position: z.string(),
  photo_url: z.string().nullable(),
});
export type EmployeePublic = z.infer<typeof employeePublicSchema>;

export const lastEventTodaySchema = z.object({
  event_type: z.enum(["came", "went"]),
  event_ts: z.string(),
});
export type LastEventToday = z.infer<typeof lastEventTodaySchema>;

export const recognizeResponseSchema = z.object({
  status: recognizeStatusSchema,
  employee: employeePublicSchema.nullable().default(null),
  confidence: z.number().min(0).max(1),
  anti_spoof_score: z.number().min(0).max(1).default(1),
  can_mark_attendance: z.boolean().default(false),
  pending_event_token: z.string().nullable().default(null),
  last_event_today: lastEventTodaySchema.nullable().default(null),
});
export type RecognizeResponse = z.infer<typeof recognizeResponseSchema>;

export const attendanceMarkResponseSchema = z.object({
  event_id: z.number().int(),
  event_type: z.enum(["came", "went"]),
  event_ts: z.string(),
  late_minutes: z.number().int().default(0),
});
export type AttendanceMarkResponse = z.infer<typeof attendanceMarkResponseSchema>;

// ---- Attendance dashboard ----

export const attendanceTodayRowSchema = z.object({
  employee_id: z.number().int(),
  full_name: z.string(),
  position: z.string(),
  photo_url: z.string().nullable(),
  expected_arrival_time: z.string(),
  min_work_hours_per_day: z.number(),
  is_active: z.boolean(),
  is_present: z.boolean(),
  came_at: z.string().nullable(),
  went_at: z.string().nullable(),
  worked_hours: z.number(),
  late_minutes: z.number().int(),
  early_leave_minutes: z.number().int(),
});
export type AttendanceTodayRow = z.infer<typeof attendanceTodayRowSchema>;

export const attendanceTodayResponseSchema = z.object({
  shift_day: z.string(),
  rows: z.array(attendanceTodayRowSchema),
  totals: z.object({
    working_now: z.number().int(),
    late: z.number().int(),
    early_left: z.number().int(),
    absent: z.number().int(),
  }),
});
export type AttendanceTodayResponse = z.infer<typeof attendanceTodayResponseSchema>;

// ---- Runtime settings ----

export const settingsSchema = z.object({
  recognition_threshold_strong: z.number().min(0.5).max(0.95),
  antispoof_threshold: z.number().min(0.5).max(0.99),
  snapshot_retention_days: z.number().int().min(7).max(365),
  kiosk_sound_enabled: z.boolean(),
});
export type SettingsValues = z.infer<typeof settingsSchema>;

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Введите текущий пароль"),
    new_password: z.string().min(8, "Минимум 8 символов"),
    confirm_password: z.string().min(1, "Повторите пароль"),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "Пароли не совпадают",
    path: ["confirm_password"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ---- Employees CRUD ----

export const arrivalTimeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const employeeFormSchema = z.object({
  full_name: z
    .string()
    .min(2, "Минимум 2 символа")
    .max(255),
  position: z.string().min(1, "Укажите должность").max(255),
  phone: z.string().max(64).optional().or(z.literal("")),
  expected_arrival_time: z
    .string()
    .regex(arrivalTimeRegex, "Формат: ЧЧ:ММ"),
  min_work_hours_per_day: z
    .number()
    .min(1, "Минимум 1 час")
    .max(24, "Максимум 24 часа"),
});
export type EmployeeFormInput = z.infer<typeof employeeFormSchema>;

export const employeeListItemSchema = z.object({
  id: z.number().int(),
  full_name: z.string(),
  position: z.string(),
  phone: z.string().nullable(),
  photo_url: z.string().nullable(),
  expected_arrival_time: z.string(),
  min_work_hours_per_day: z.number(),
  is_active: z.boolean(),
  embeddings_count: z.number().int(),
});
export type EmployeeListItem = z.infer<typeof employeeListItemSchema>;

export const employeeListSchema = z.array(employeeListItemSchema);

export const employeeCreatedSchema = employeeListItemSchema
  .omit({ embeddings_count: true })
  .extend({
    photo_quality_scores: z.array(z.number()),
  });
export type EmployeeCreated = z.infer<typeof employeeCreatedSchema>;
