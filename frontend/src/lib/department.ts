/**
 * Department — structured axis ('Зал' / 'Кухня' / 'Прочее') on top of
 * the free-text `position` field. Added in V1.1 once the manager said
 * the two staff groups (waiters vs cooks) needed to be visible at a
 * glance for filtering the attendance dashboard.
 */

import type { Department } from "./zod";

export const DEPARTMENT_VALUES = ["hall", "kitchen", "other"] as const satisfies readonly Department[];

export const DEPARTMENT_LABEL: Record<Department, string> = {
  hall: "Зал",
  kitchen: "Кухня",
  other: "Прочий штат",
};

export const DEPARTMENT_DESCRIPTION: Record<Department, string> = {
  hall: "Официанты, зав. зала",
  kitchen: "Повара, пекарня, уборка, посуда",
  other: "Касса, бармен, склад, управление",
};

/** Tailwind class for the small colored dot beside the label. */
export const DEPARTMENT_DOT: Record<Department, string> = {
  hall: "bg-bek-indigo",
  kitchen: "bg-bek-amber",
  other: "bg-bek-textFaint",
};

/** Tailwind class for a soft pill background (admin theme). */
export const DEPARTMENT_PILL: Record<Department, string> = {
  hall: "bg-bek-surfaceIndigo text-bek-indigo",
  kitchen: "bg-bek-amberSoft text-bek-amber",
  other: "bg-bek-surface2 text-bek-textMuted",
};
