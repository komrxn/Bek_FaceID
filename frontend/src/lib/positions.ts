/**
 * Position catalog — the standardized list of staff roles, grouped under
 * the structured `department` axis (V1.5).
 *
 * Before V1.5 `position` was free-text typed by hand at enrollment, which
 * produced inconsistent spellings ("Повар" / "повар" / "Повар 1-блюда")
 * that made dashboard filtering by role impossible. The manager
 * standardized the staff structure: every employee now picks a role from
 * the fixed list for their department.
 *
 * `position` is still stored as the plain Russian label (the Excel табель
 * and every list view consume the raw string) — this catalog is the
 * single source of truth that constrains which labels are valid, enforced
 * at the enrollment UI. Keep in sync with the manager's official tree.
 */

import type { Department } from "./zod";

export const POSITIONS_BY_DEPARTMENT: Record<Department, readonly string[]> = {
  hall: ["Официанты", "Зав Зала"],
  kitchen: [
    "1-блюда",
    "2-блюда",
    "Салат",
    "Шашлык",
    "Пекарня",
    "Чайханщик",
    "Уборка",
    "посудомойка",
  ],
  other: ["Касса", "Бармен", "Базарком", "ЗавСклад", "Управляющий"],
};

/** Flat list of every catalog position, department order preserved. */
export const ALL_POSITIONS: readonly string[] = [
  ...POSITIONS_BY_DEPARTMENT.hall,
  ...POSITIONS_BY_DEPARTMENT.kitchen,
  ...POSITIONS_BY_DEPARTMENT.other,
];

export function positionsFor(dept: Department): readonly string[] {
  return POSITIONS_BY_DEPARTMENT[dept];
}

/** Which department a catalog position belongs to, or null if off-catalog. */
export function departmentForPosition(position: string): Department | null {
  for (const dept of Object.keys(POSITIONS_BY_DEPARTMENT) as Department[]) {
    if (POSITIONS_BY_DEPARTMENT[dept].includes(position)) return dept;
  }
  return null;
}
